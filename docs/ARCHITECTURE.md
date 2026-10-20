# System Design & Architecture — CinX (Ticketing Cinema)

> Dokumen ini menjelaskan desain sistem, arsitektur, trade-off, dan analisis
> CAP/consistency–availability berdasarkan kode aktual di repo. Pendamping untuk
> `docs/openapi.yaml` (kontrak REST) dan `docs/ERD.md` (model relasional).

---

## 1. Bird's-Eye View

```
Browser (Vue 3 SPA :5173)
   │  fetch + Bearer JWT  (apps/web/src/shared/api/client.ts)
   ▼
REST Gateway :3000  ── BFF tanpa state, tanpa DB (apps/gateway)
   │  gRPC (packages/shared/proto + grpc-clients.ts)
   ├──► user-service    ──► user_db    (PostgreSQL)
   ├──► cinema-service  ──► cinema_db  (PostgreSQL)
   ├──► booking-service ──► booking_db (PostgreSQL) + Redis (seat locks)
   ├──► payment-service ──► payment_db (PostgreSQL) + Xendit API
   └──► ticket-service  ──► ticket_db  (PostgreSQL)
              │
              └── domain events ──► RabbitMQ ticketing.internal (topic)
                                      ├──► booking-service
                                      ├──► payment-service
                                      ├──► ticket-service
                                      └──► notification-service (Resend email)
Xendit ── webhook ──► Gateway ──► payment-service
Semua service ──OTLP──► otel-collector ──► Tempo (traces) + Prometheus ──► Grafana
```

Pola yang dipakai: **API Gateway / BFF + Microservices dengan
database-per-service + Orchestration-based Saga (manual) + Distributed lock**.
Frontend tidak pernah tahu ada enam service — dia hanya bicara REST ke satu
origin. Gateway adalah satu-satunya router perintah sinkron; booking, payment,
dan ticket berkoordinasi lewat event.

---

## 2. Keputusan Arsitektur & Trade-off

### a) Gateway sebagai BFF (Backend-for-Frontend)

SPA hanya tahu `GET /api/v1/movies` (REST+JSON). Gateway yang menerjemahkan ke
panggilan gRPC.

- ✅ **Trade-off diterima:** satu hop ekstra (latensi +~1–5ms), dan gateway jadi
  komponen yang harus di-scale horizontal. Tapi SPA mendapat satu API yang
  didesain untuk UI (agregasi), CORS sederhana (same-origin — `client.ts` tidak
  butuh konfigurasi CORS di dev karena Vite proxy `/api` → `:3000`), dan
  kontrak frontend yang stabil meski internal service berubah.
- Kontrak gRPC di-parse jadi error HTTP yang rapi (`normalizeRpcError` di
  gateway) — `ApiError` di frontend punya `statusCode` dan bahkan
  `conflictSeatIds` untuk kasus 409.

### b) Database-per-Service + Referensi Logis Antar-DB

`user_db`, `cinema_db`, `booking_db`, `payment_db`, dan `ticket_db` terpisah
fisik (dibuat via `infra/init/init.sql`). `booking_db` memiliki `bookings` dan
`booking_seats`; `payment_db` hanya `payments`; `ticket_db` hanya `tickets`.
Kolom `user_id`/`showtime_id`/`seat_id`/`booking_id` adalah **referensi logis
tanpa FK lintas DB**, dan data kursi/film di-snapshot saat hold.

- ✅ Ini yang membuat microservice benar-benar independen: booking, payment,
  dan ticket bisa di-deploy/migrasi tanpa menyentuh cinema-service — inti dari
  *data ownership*.
- ❌ **Trade-off:** tidak ada join lintas DB dan FK integrity. Kompensasinya:
  - Validasi kursi tetap lintas service: `hold()` di booking-service memanggil
    `seatAvailability.validateSeats()` (gRPC → cinema-service) sebelum
    mengunci.
  - Snapshot (`BookingSeat`) menjamin riwayat booking tetap utuh dan akurat
    bahkan jika data kursi di cinema-service berubah/hilang setelahnya —
    konsistensi historis lebih penting daripada normalisasi.
  - Kedua DB ditulis dalam satu orkestrasi, bukan satu transaksi — inilah yang
    membuat pattern lock + constraint (§3) diperlukan.

### c) gRPC untuk inter-service, REST untuk klien

Stub ter-typing di `packages/shared/src/grpc-clients.ts` (`UserServiceStub`,
`CinemaServiceStub`, `BookingServiceStub`, `PaymentServiceStub`,
`TicketServiceStub`) + proto di `packages/shared/proto`.
Trade-off klasik: gRPC memberi kontrak biner yang ketat dan efisien, tapi tidak
bisa dipakai browser langsung — itulah kenapa gateway wajib ada.

---

## 3. Jantung Sistem: Booking Flow (Two-Phase Hold→Pay)

Sumber: `apps/booking-service/src/bookings/bookings.service.ts`,
`apps/payment-service/src/payments/payments.service.ts`, dan
`apps/ticket-service/src/tickets/tickets.service.ts`.

```
1. HOLD    POST /bookings/holds → gateway → booking.Hold
           ├─ validasi kursi ke cinema-service (gRPC)
           ├─ redlock multi-lock(["seat:{showtimeId}:{seatId}", ...], TTL 5 menit)
           │    gagal → 409 "Some seats are already held"
           │    Redis mati → 503 "Seat lock unavailable" (BUKAN 409!)
           └─ sukses → INSERT Booking(status=PENDING, expiresAt=+5m)
                        + snapshot seats/movie/theater/start
2. PAY     POST /bookings/:id/pay → gateway
           ├─ booking.PrepareCharge (read-only: ownership, state, expiry, amount)
           └─ payment.Charge → Xendit invoice (hosted) → checkoutUrl
3. WEBHOOK Xendit → gateway → payment.Webhook (atau payment.SyncPaymentStatus)
           ├─ payment-service update payments + emit payment.settled/failed
           └─ booking-service consume:
                settled → paid_at, release locks, emit booking.confirmed
                          + payment.received
                failed  → CANCELLED, emit booking.cancelled
4. CONFIRM booking.confirmed → ticket-service issue tickets (idempotent)
           └─ tickets.issued → booking-service set CONFIRMED/tickets_issued_at
              → notification-service send ticket email
5. REFUND  POST /bookings/:id/cancel pada booking CONFIRMED
           ├─ booking set REFUND_PENDING, emit booking.refund.requested
           ├─ payment-service POST /refunds (Xendit) — refund async
           ├─ SUCCEEDED → payment.refunded → booking REFUNDED
           │              → booking.refunded → ticket-service void tickets
           ├─ PENDING   → REFUND_PENDING: kursi MASIH dipegang, tiket masih sah
           └─ FAILED    → payment.refund_failed → kembali ke state berbayar
6. EXPIRE  Cron booking-service tiap menit
           ├─ hanya PENDING yang BELUM dibayar → EXPIRED + release locks
           ├─ emit booking.expired → payment-service expire invoice
           └─ paid-PENDING tidak pernah di-expire; confirmation-retry cron
              mengirim ulang booking.confirmed jika tickets.issued hilang
7. LATE    payment.settled untuk EXPIRED/CANCELLED → refund otomatis,
           tidak pernah menerbitkan tiket
```

### Kompensasi saga: refund bukan sekadar ubah status

Langkah `PAY` adalah satu-satunya langkah yang benar-benar memindahkan uang,
jadi pembatalannya tidak boleh hanya menandai booking mati. Aturannya:

- **Jangan pernah bilang REFUNDED sebelum provider bilang SUCCEEDED.**
  Booking baru berstatus `REFUNDED` (terminal) setelah Xendit menuntaskan
  refund; selama masih `REFUND_PENDING` booking tetap dianggap lunas.
- **Kepemilikan kursi mengikuti uang, bukan keinginan.** Selama
  `REFUND_PENDING` kursi tetap `BOOKED` dan tiket tetap sah; kalau refund
  gagal, booking kembali `CONFIRMED` tanpa ada yang perlu dipulihkan.
- **Idempoten secara alami:** `REFUND_PENDING`/`REFUNDED` ditolak 409, jadi
  cancel kedua tidak pernah mengirim refund kedua.
- **Late money tidak membeli tiket.** Settlement setelah hold kedaluwarsa
  memicu `booking.refund.requested`; kursi yang sudah dijual ke orang lain
  tidak pernah diambil kembali.

Ini contoh konkret kenapa saga butuh langkah kompensasi eksplisit: tanpa itu,
pelanggan yang sudah membayar tidak punya jalan keluar sama sekali.

**Dua lapis pertahanan anti double-booking:**

| Lapis | Mekanisme | Sifat |
| --- | --- | --- |
| 1 | Redis redlock, `seat:{showtimeId}:{seatId}`, TTL 5 menit | Cepat, tapi *best-effort* |
| 2 | **`UNIQUE (showtime_id, seat_id)`** di `booking_db.booking_seats` | Hard guarantee di DB |

Komentar di kode menyatakan ini eksplisit: *"Redis is the concurrency layer;
the UNIQUE index on booking_seats is the hard double-booking guard."* — DB
adalah **source of truth**, Redis hanya *optimisasi concurrency*.

## 4. Analisis CAP Theorem

CAP: dalam keberadaan **network partition (P)** — yang di sistem terdistribusi
nyata bukan pilihan melainkan kepastian — sistem harus memilih antara
**Consistency (C)** (semua node melihat data sama di waktu sama) atau
**Availability (A)** (setiap request mendapat respons, walau data mungkin
stale).

Teorema ini sering disalahpahami sebagai "pilih satu untuk seluruh sistem".
Sistem nyata seperti ini justru **menempatkan CP dan AP di titik berbeda**
tergantung domain data.

### Domain-by-domain

| Domain | Klasifikasi | Kenapa |
| --- | --- | --- |
| **Seat holding (hold kursi)** | **CP** | Dua orang menghold kursi yang sama = bencana bisnis. Lebih baik tolak request (409) daripada menerima keduanya. Redlock: majority quorum, lock tidak bisa diperoleh → request ditolak. Sistem memilih *tidak available* untuk kursi yang diperdebatkan, demi konsistensi. |
| **Konfirmasi pembayaran** | **CP (via DB)** | `UNIQUE(showtime_id, seat_id)` adalah garis konsistensi terakhir. Kalau dua jalur (webhook + sync-payment) balapan, satu `INSERT` gagal di constraint — sistem tetap C bahkan saat lock sudah rusak. |
| **Katalog film/teater (browsing)** | **AP** | Guest membuka daftar film boleh melihat data sedikit stale. Tidak ada mekanisme C di sini — service menjawab dari DB-nya sendiri tanpa koordinasi. Availability diutamakan. |
| **Email notifikasi** | **AP / eventual** | RabbitMQ topic exchange, at-least-once dengan manual ack. Email telat/dua kali tidak merusak invariant bisnis. |
| **Tracing/metrics (OTel)** | **AP, sampling 20%** (`VITE_OTEL_SAMPLE_RATIO=0.2`) | Data observability boleh hilang sebagian; tidak boleh memperlambat request. |

Jadi jawaban yang tepat bukan "CinX adalah sistem CP" atau "AP", melainkan:
**CinX adalah sistem per-domain** — CP di invariant uang/kursi, AP di sisi baca
publik dan async.

### Kenapa Redlock — dan kontroversinya

Redlock dikritik Martin Kleppmann (2016): karena bergantung pada waktu, lock
bisa *expire* saat pemegangnya masih bekerja (GC pause, delay jaringan) → dua
pemegang. Kleppmann menyarankan fencing token; debat dengan antirez (pencipta
Redis) berakhir tanpa konsensus tentang keamanan murni.

**Bagaimana codebase ini membela diri dari kritik tersebut:**

1. **DB fencing token secara efektif** — constraint `UNIQUE` adalah fencing
   token yang tidak bisa di-spoof: "buktikan di DB atau kamu tidak masuk". Ini
   persis filosofi Kleppmann diimplementasikan tanpa perlu algoritma lock yang
   sempurna.
2. **Fail-closed saat Redis mati** — di `hold()`:

   ```ts
   if (this.isRedisUnavailable(err)) throw rpcErrorPayload(503, 'Seat lock unavailable');
   ```

   Komentarnya: *"A down/unreachable Redis must not masquerade as 'seat
   taken'"*. Redis down → sistem menolak hold (tidak available) alih-alih
   menebak. Pilihan CP yang sadar.
3. **Idempotent handler** — webhook diproses ulang (Xendit retry) tidak membuat
   tiket dobel; `confirm` pada booking yang sudah `CONFIRMED` adalah no-op.

### Sebenarnya ini PACELC

CAP tidak bicara latency. PACELC melengkapinya: *if Partition → pilih A atau C;
else (Else, tanpa partisi) → pilih antara Latency atau Consistency*. CinX
memilih **latensi** di jalur normal: hold hanya butuh 1 panggilan Redis quorum
- 1 gRPC + 1 INSERT — tanpa consensus protocol berat (Raft/Paxos/ZooKeeper) di
hot path. Konsistensi "dibayar" hanya saat konflik (409) atau partisi (503).
Itu trade-off yang rasional untuk sistem tiket dengan traffic puncak saat
presale.

---

## 5. Peta Konsistensi (dari kuat ke lemah)

| Konsistensi | Mekanisme | Di kode |
| --- | --- | --- |
| **Linearizable** (di resource lock) | Redlock quorum, TTL 5 menit | `SeatLockService.hold()` |
| **Strong (ACID, per-service)** | Transaksi PostgreSQL, constraint UNIQUE | `booking_seats` (TypeORM entity) |
| **Read-your-writes** | SPA menyimpan token; `refreshMe()` memverifikasi sebelum route guarded | `auth-store.ts`, router guard |
| **Snapshot-on-write** | Data kursi di-copy saat hold, tidak berubah setelahnya | `BookingSeat` snapshot |
| **Eventual** | Webhook → DB; sync-payment sebagai *anti-entropy* jika event hilang | `ConfirmationPage.vue` polling → `syncPayment()` |
| **Causal + best-effort** | Email, tracing; OTel `traceparent` menghubungkan klik → trace backend | `messaging-trace.ts`, `otel.ts` |

Perhatikan pola **webhook + polling fallback** — ini pola menangani *eventual
consistency yang harus terasa instan bagi user*: UI tidak menunggu event
datang; dia secara aktif menanyakan status (pull) sementara webhook (push)
adalah jalur cepatnya. Kalau webhook hilang (partisi Xendit→Anda), sistem
*self-heals* saat user membuka halaman konfirmasi.

---

## 6. Availability: bagaimana sistem tetap hidup

- **Gateway & services stateless** — bisa direplikasi horizontal tanpa sticky
  session (JWT stateless, auth via `Authorization: Bearer`). Bottleneck
  availability utama sebenarnya adalah Postgres & Redis single-instance di
  compose ini (di produksi: HA Postgres, Redis Sentinel/Cluster).
- **Degradasi fungsional, bukan crash:** landing page punya `FALLBACK_ROWS` +
  badge "DEMO BOARD" (`LandingPage.vue`) — gateway mati sekalipun, landing
  tetap menampilkan konten. Ini *graceful degradation* di edge.- **Timeout & retry ada di batas service** (`grpcSend` di shared), dan kegagalan Redis dipetakan ke 503 yang jujur — bukan 409 yang menipu user bahwa kursi sudah diambil orang.
- **Email adalah efek samping, bukan langkah transaksi.** Booking-service
  mem-publish `booking.confirmed` (dengan recipient hasil `UserService.Get`)
  dan `payment.received`; ticket-service mem-publish `tickets.issued`.
  Notification-service mengubahnya menjadi email. Publish bersifat
  *best-effort*: kalau broker mati, booking yang sudah dibayar tetap sah dan
  kegagalannya hanya dicatat — uang tidak boleh batal karena email gagal.
  Booking-service tetap tidak menyimpan data pelanggan (batas *data ownership*
  tetap utuh).

---

## 7. Ringkasan Trade-off

| Keputusan | ✅ Didapat | ❌ Dibayar |
| --- | --- | --- |
| Database-per-service | Independensi deploy, data ownership | Tidak bisa JOIN lintas domain; butuh snapshot + validasi gRPC |
| Redis lock sebagai lapis 1 | Hold cepat (sub-ms), auto-expiry elegan (TTL = hold window) | Keamanan lock tidak absolut → wajib dibayar dengan constraint DB |
| Webhook async | Tidak blokir user, tahan fluktuasi | Event bisa hilang/telat → perlu sync-payment + polling + idempotency |
| Gateway BFF | API disesuaikan UI, CORS nol-ribet | Hop ekstra, gateway harus HA |
| Orchestration (bukan choreography) | Flow hold→pay→confirm mudah dilacak (satu trace OTel end-to-end) | booking-service memegang state saga dan harus idempoten terhadap event duplikat |
| Event-driven domain split | Booking, payment, dan ticket punya batas data/command yang jelas | Butuh durable queue, manual ack, event contracts, dan rekonsiliasi saat event hilang |
| Multi-service vs monolith | Skala per-service, boundary jelas | Overhead operasional (7 container + observability stack untuk satu aplikasi) — untuk skala kecil ini *over-engineering*, tapi itulah harganya belajar microservices |

---

## 8. Satu Kalimat Penutup

> **CinX memilih CP di invariant yang tidak boleh dilanggar (kursi tidak dobel
> terjual, uang), AP di semua yang boleh stale (katalog, email, telemetry), dan
> memastikan keputusan CP-nya tidak bergantung pada keamanan lock semata —
> melainkan dijamin oleh constraint database, karena partisi jaringan bukan
> "jika" melainkan "kapan".**

---

## 9. Glosarium

Istilah teknis yang dipakai di dokumen ini, dikelompokkan per tema, dengan
padanannya di kode CinX.

### Pola arsitektur

| Istilah | Arti | Di CinX |
| --- | --- | --- |
| **SPA** (Single Page Application) | Aplikasi web yang dimuat sekali di browser lalu diperbarui lewat panggilan API, bukan reload halaman penuh | Aplikasi Vue 3 di `:5173` |
| **API Gateway** | Satu pintu depan yang menerima semua request klien lalu meneruskannya ke service internal | `apps/gateway` di `:3000` |
| **BFF** (Backend-for-Frontend) | Gateway yang didesain khusus untuk satu frontend — membentuk data backend persis sesuai kebutuhan UI | Gateway menggabungkan balasan gRPC menjadi satu respons REST/JSON |
| **Microservices** | Memecah aplikasi menjadi service kecil yang independen, masing-masing memiliki satu domain | user, cinema, booking, payment, ticket, notification |
| **Monolith** | Kebalikannya: satu aplikasi berisi semuanya | — |
| **Database-per-service** | Setiap service punya database privat sendiri; service lain tidak pernah query langsung | `user_db`, `cinema_db`, `booking_db`, `payment_db`, `ticket_db` |
| **Data ownership** | Hanya satu service yang boleh menulis datanya; yang lain harus meminta lewat API-nya | Hanya cinema-service yang boleh mengubah data kursi/teater |
| **Saga** | Alur kerja multi-langkah lintas service; tiap langkah commit lokal, kegagalan dibatalkan dengan langkah kompensasi (bukan satu transaksi besar) | hold → pay → confirm/refund melintasi booking, payment, dan ticket |
| **Orchestration** (vs **choreography**) | Gaya saga dengan satu koordinator yang mengarahkan semua langkah (seperti konduktor orkestra); choreography = service saling bereaksi lewat event tanpa konduktor | booking-service memegang state saga; payment/ticket bereaksi lewat event |
| **Distributed lock** | Cara memastikan "hanya satu pihak boleh menyentuh resource ini saat ini" lintas mesin | Lock Redis per kursi |
| **Stateless** | Server tidak menyimpan memori antar-request; setiap request membawa semua yang dibutuhkan | Gateway/service bisa di-restart bebas; token ikut di tiap request |

### Komunikasi & data

| Istilah | Arti | Di CinX |
| --- | --- | --- |
| **REST** | API berbasis URL + metode HTTP, umumnya JSON | `GET /api/v1/movies` |
| **gRPC** | Protokol biner cepat untuk komunikasi antar-service, kontraknya didefinisikan di file `.proto`; browser tidak bisa memakainya langsung (alasan gateway wajib ada) | gateway → booking/payment/ticket/cinema/user |
| **Stub** | Kode klien hasil generate untuk memanggil service gRPC, dengan typing | `BookingServiceStub`, `PaymentServiceStub`, `TicketServiceStub` |
| **Webhook** | "Saat X terjadi, panggil URL saya" — notifikasi push dari satu sistem ke sistem lain | Xendit memanggil gateway saat pembayaran sukses |
| **Topic exchange** | Exchange yang merutekan pesan berdasarkan pola routing key, bukan menyiarkan ke semua queue | `ticketing.internal` merutekan `payment.*` dan `booking.*` ke queue masing-masing |
| **CORS** | Aturan keamanan browser untuk halaman yang memanggil origin berbeda; panggilan same-origin bebas CORS | Vite mem-proxy `/api` → `:3000`, jadi tidak perlu konfigurasi CORS |
| **FK** (Foreign Key) | Kolom DB yang menegaskan "baris ini harus merujuk baris nyata di tabel lain" | Sengaja **tidak ada** lintas DB — diganti validasi gRPC + snapshot |
| **Join** | Menggabungkan tabel dalam satu query SQL; mustahil lintas database terpisah | Baris booking membawa snapshot, bukan join |
| **Snapshot** | Salinan data pada satu titik waktu agar riwayat tetap akurat walau sumbernya berubah | `BookingSeat` menyimpan info kursi saat hold |
| **Idempotent** | Request yang sama diterima dua kali tidak menimbulkan efek ganda | Webhook Xendit yang dikirim ulang tidak membuat tiket dobel |

### Locking, concurrency & kebenaran

| Istilah | Arti | Di CinX |
| --- | --- | --- |
| **Redis** | Data store in-memory yang sangat cepat; lazim untuk cache, counter, dan lock | Menyimpan lock kursi |
| **Redlock** | Algoritma lock Redis yang aman lintas beberapa node: lock sah hanya jika didapat di **mayoritas** node (**quorum**) | `seat:{showtimeId}:{seatId}` |
| **TTL** (Time-To-Live) | Waktu kedaluwarsa otomatis pada data | Lock/hold mati sendiri setelah 5 menit |
| **Fencing token** | Bukti yang harus ditunjukkan di gerbang akhir, agar pemegang lock basi tidak bisa merusak ("buktikan di DB, atau tidak masuk") | Constraint `UNIQUE (showtime_id, seat_id)` menolak INSERT kedua |
| **Double-booking** | Kursi yang sama terjual ke dua orang — invariant yang dijaga seluruh desain | dicegah lock (lapis 1) + UNIQUE constraint (lapis 2) |
| **Fail-closed** | Saat komponen keamanan rusak, sistem menolak request daripada berisiko melewatkan yang salah | Redis mati → 503 "Seat lock unavailable", bukan 409 palsu |
| **Source of truth** | Lokasi data yang berwenang saat ada perbedaan | Postgres, bukan Redis — Redis hanya optimisasi |
| **Cron / reconcile** | Timer berkala yang memeriksa ulang dan memperbaiki state | Tiap menit booking-service meng-expire hold, mengulang konfirmasi, dan merekonsiliasi refund |
| **Hot path** | Jalur kode yang paling sering dieksekusi dan wajib cepat | Alur hold normal (1 Redis + 1 gRPC + 1 INSERT) |
| **GC pause** | Jeda garbage collection; program bisa berhenti beberapa detik di tengah pekerjaan — cara klasik lock "hilang" (kritik Kleppmann atas Redlock) | Alasan ada lapis ke-2 |

### Teori konsistensi (CAP & kawan-kawan)

| Istilah | Arti | Di CinX |
| --- | --- | --- |
| **CAP theorem** | Saat jaringan terbelah (**P**artition — pasti terjadi cepat atau lambat), sistem harus memilih: menolak sebagian request demi kebenaran (**C**onsistency) atau terus menjawab dengan data yang mungkin basi (**A**vailability) | Analisis utama dokumen ini |
| **CP** | Memilih kebenaran: request yang konflik ditolak | Hold kursi → 409 |
| **AP** | Memilih ketersediaan: selalu menjawab walau data mungkin sedikit stale | Katalog film, email, tracing |
| **PACELC** | Perluasan CAP: tanpa partisi pun (**Else**) tetap ada trade-off antara **L**atency dan **C**onsistency | CinX memilih latensi rendah di jalur normal, membayar konsistensi hanya saat konflik |
| **Stale data** | Data yang basi/sebentar tua, bukan salah | Daftar film yang telat beberapa detik |
| **Linearizable** | Jaminan terkuat: operasi pada satu resource terlihat terjadi satu per satu, sesuai urutan waktu nyata | Kursi yang sedang di-lock |
| **ACID** | Jaminan transaksi klasik satu database: Atomic, Consistent, Isolated, Durable | Transaksi PostgreSQL di tiap service |
| **Read-your-writes** | Setelah menulis, bacaan berikutnya pasti melihat tulisan itu | Sesi/token diverifikasi sebelum route guarded dimuat |
| **Eventual consistency** | Pembaruan menyebar seiring waktu; salinan akan menyatu jika ditunggu | `CONFIRMED` muncul setelah `payment.settled` → `booking.confirmed` → `tickets.issued` |
| **Anti-entropy** | Mekanisme latar yang memperbaiki ketidaksesuaian saat jalur cepat kehilangan data | Polling `sync-payment` saat webhook hilang |
| **Causal consistency** | Efek selalu muncul setelah penyebabnya | Trace klik terhubung ke trace backend |
| **Consensus (Raft / Paxos / ZooKeeper)** | Algoritma berat yang membuat kluster sepakat sebagai satu — kuat tapi lambat; sengaja tidak dipakai di hot path | — |
| **Kleppmann vs antirez** | Debat terkenal 2016: Martin Kleppmann berargumen Redlock tidak 100% aman (bergantung waktu); pencipta Redis antirez menolak. Tidak ada pemenang mutlak — karenanya dipakai defense in depth | Bagian "kenapa Redlock" di §4 |

### Operasional, auth & observability

| Istilah | Arti | Di CinX |
| --- | --- | --- |
| **JWT (Bearer token)** | Token bertanda tangan yang dikirim klien di header `Authorization` untuk membuktikan identitas; server tidak perlu penyimpanan sesi | `Authorization: Bearer …` |
| **Sticky session** | Trik load balancer yang memaksa user kembali ke server yang sama (hanya perlu untuk server *stateful*); desain stateless menghapus kebutuhan ini | Tidak dipakai |
| **Horizontal scaling** | Menambah replika service di belakang load balancer | Replika gateway |
| **HA** (High Availability) | Rekayasa komponen agar bertahan hidup saat gagal (replika, failover) | "HA Postgres, Redis Sentinel/Cluster" di produksi |
| **Redis Sentinel/Cluster** | Setup Redis yang bertahan saat satu node mati (monitor/failover, atau shard + replikasi) | — |
| **Graceful degradation** | Saat dependensi mati, tampilkan konten terbatas alih-alih crash | `FALLBACK_ROWS` + badge "DEMO BOARD" di landing page |
| **Timeout & retry** | Membatasi lama menunggu service lain, lalu mencoba ulang dengan aman | `grpcSend` di shared |
| **OTel (OpenTelemetry)** | Standar instrumentasi untuk memancarkan trace/metrics dari kode | Semua service ter-instrumentasi |
| **OTLP** | Protokol yang dipakai OTel untuk mengirim data telemetry | → otel-collector |
| **Trace / traceparent** | Perjalanan satu request lintas service, dijahit oleh ID yang di-propagasi dari ujung ke ujung | Klik → gateway → booking/payment → event → ticket dalam satu tampilan |
| **Sampling (20%)** | Hanya merekam sebagian trace agar observability tidak memperlambat aplikasi | `VITE_OTEL_SAMPLE_RATIO=0.2` |
| **Tempo / Prometheus / Grafana** | Penyimpanan trace / penyimpanan metrics / dashboard di atas keduanya | Stack observability di compose |
| **409 / 410 / 503** | Kode HTTP: 409 = conflict ("sudah diambil orang"), 410 = gone (hold kedaluwarsa), 503 = service unavailable ("jujur belum bisa memutuskan") | Dipakai apa adanya sesuai kondisi |

Model mental satu kalimat untuk seluruh dokumen: **lock cepat dulu (Redis),
jaminan keras terakhir (UNIQUE di Postgres), error yang jujur selalu
(409 vs 503), dan data stale boleh di mana pun kecuali kursi dan uang.**
