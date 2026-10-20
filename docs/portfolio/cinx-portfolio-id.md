# CinX — Platform Pemesanan Tiket Bioskop

> Sistem pemesanan tiket bioskop per kursi yang dibangun sebagai sistem
> terdistribusi: hold kursi lima menit, pembayaran asinkron, penerbitan tiket
> berbasis event, dan refund yang mengikuti uang — bukan sekadar mengganti
> status.

| | |
| --- | --- |
| **Jenis** | Proyek portofolio / showcase rekayasa perangkat lunak |
| **Peran** | Solo — desain domain, backend, frontend, infrastruktur, pengujian |
| **Stack** | Vue 3 · NestJS · gRPC · PostgreSQL · Redis · RabbitMQ · Xendit |
| **Status** | Berjalan end-to-end; topologi development/demo (belum klaim HA) |
| **Repo** | [`ticketing-cinema`](https://github.com/ridwanmuh3/ticketing-cinema) |

---

## 1. Gambaran Proyek

Pemesanan tiket bioskop terlihat sederhana sampai dua orang menekan kursi yang
sama pada detik yang sama. Masalah menariknya bukan halaman CRUD — melainkan
**rebutan kursi**, **pembayaran yang datang terlambat atau tidak sama sekali**,
dan **state yang harus tetap benar di antara service yang memiliki data
berbeda**.

CinX memodelkan perjalanan lengkap: menjelajah katalog, memilih jadwal,
memilih kursi, menahan kursi selama lima menit, membayar melalui hosted
checkout, menerima tiket lewat email, dan — ketika ada yang gagal — membatalkan
atau me-refund tanpa pernah menjual kursi yang sama dua kali.

Inti implementasinya memakai dua lapis perlindungan:

1. **Redis `redlock`** per kursi (`seat:{showtimeId}:{seatId}`, TTL 5 menit)
   sebagai lapisan konkurensi yang cepat.
2. **`UNIQUE (showtime_id, seat_id)`** pada `booking_seats` sebagai jaminan
   keras. Database adalah sumber kebenaran; Redis hanya optimisasi.

Keputusan itu menentukan sisanya: booking-service menyimpan snapshot kursi,
film, teater, dan jadwal saat hold; pembayaran dan penerbitan tiket berjalan
lewat topic exchange RabbitMQ; dan refund diperlakukan sebagai kompensasi saga,
bukan aksi UI.

### Ringkasan cepat

| Dimensi | Nilai |
| --- | --- |
| Aplikasi yang di-deploy | 8 (SPA Vue, REST gateway, 6 service backend) |
| Service domain gRPC | 5 — user, cinema, booking, payment, ticket |
| Database | 5 database PostgreSQL logis, satu instance di development |
| Permukaan REST | 27 operasi terdokumentasi di `docs/openapi.yaml` |
| Jendela hold | 5 menit, maksimal 8 kursi per booking |
| Penyedia pembayaran | Xendit hosted invoice + webhook + refund |
| Email | Resend (best-effort, non-transaksional) |
| Observability | OpenTelemetry → Collector → Tempo / Prometheus / Grafana |
| Verifikasi | Jest, Vitest, Playwright, k6 (matriks 100 / 500 / 1.000 VU) |

### Yang sengaja di luar cakupan

CinX adalah proyek portofolio, bukan deployment produksi. High availability
untuk PostgreSQL, Redis, dan RabbitMQ belum dikonfigurasi; topologi bawaan
memakai satu instance untuk masing-masing. Belum ada transactional outbox,
dead-letter queue dengan retry terbatas, maupun alur migrasi berversi. Semua itu
didokumentasikan sebagai rencana lanjutan, bukan disembunyikan.

---

## 2. Fitur

### Pengalaman pelanggan

- **Menjelajah katalog** — film now-showing dan coming-soon, genre, durasi,
  rating usia, poster, dan jadwal dengan harga dari server.
- **Pemilihan kursi** — seat map langsung yang menggabungkan geometri teater
  dari `cinema-service` dengan ketersediaan dari `booking-service`; kursi
  berstatus `AVAILABLE`, `HELD`, atau `BOOKED`.
- **Akun** — autentikasi JWT, registrasi, login, verifikasi sesi, dan riwayat
  booking pribadi.
- **Hold lima menit** — jendela reservasi dengan countdown. Maksimal delapan
  kursi per booking; kursi yang bentrok mengembalikan `409` beserta ID kursi
  yang konflik agar UI bisa menyorotnya.
- **Hosted checkout** — invoice Xendit dibuat di server; browser diarahkan ke
  halaman penyedia, sehingga data kartu tidak pernah menyentuh aplikasi.
- **Konfirmasi yang konvergen** — halaman konfirmasi melakukan polling saat
  `payment.settled → booking.confirmed → tickets.issued` menyebar, dan
  `sync-payment` menjadi fallback anti-entropy ketika webhook hilang.
- **Tiket** — diterbitkan sekali per kursi yang dibayar, dengan kode
  `TKT-XXXXXXXX` yang mudah dibaca dan bisa diverifikasi publik.
- **Batal dan refund** — booking yang belum dibayar langsung dibatalkan;
  booking yang sudah dibayar melewati `REFUND_PENDING` dan baru menjadi
  `REFUNDED` setelah penyedia mengonfirmasi uang kembali. Tiket baru
  di-void setelah konfirmasi itu.
- **Email** — konfirmasi booking, kode tiket, dan kuitansi pembayaran lewat
  Resend, dengan mode logging saja bila API key belum diisi.

### Panel admin

- **Manajemen katalog** — buat, ubah, dan hapus film, genre, teater, dan jadwal
  di balik pemeriksaan role admin.
- **Layout teater** — tentukan jumlah baris dan kursi saat membuat auditorium;
  kursi membawa kategori (`REGULAR`, `VIP`, `COUPLE`), aksesibilitas, dan flag
  nonaktif.
- **Integritas jadwal** — pembuatan dan perubahan showtime menolak slot yang
  tumpang tindih di teater yang sama, memakai pengecekan interval half-open
  terhadap durasi film.
- **Harga yang aman** — nominal disimpan sebagai integer IDR (`bigint`), tidak
  pernah floating point.

### Platform dan rekayasa

- **Database per service** — setiap service hanya menulis database miliknya;
  domain lain direferensikan secara logis dan dirangkai lewat API atau event.
- **Orkestrasi saga** — gateway merutekan command, `booking-service` memegang
  state saga, payment dan ticket bereaksi terhadap event. Tidak ada service
  yang membaca database service lain.
- **Consumer idempoten** — webhook ganda dan event yang diputar ulang tidak
  membuat tiket dobel atau refund dobel.
- **Cron rekonsiliasi** — expiry, retry konfirmasi, sinkronisasi pembayaran,
  dan retry refund memperbaiki state ketika event hilang.
- **Error yang jujur** — Redis mati mengembalikan `503 Seat lock unavailable`,
  bukan `409 kursi sudah diambil` yang menyesatkan.
- **Observability** — trace dan metrik OTLP dari setiap service, propagasi trace
  dari browser, serta dashboard Grafana di atas Tempo dan Prometheus.
- **Alat uji dan load test** — unit dan integration test, alur end-to-end
  Playwright, dan skenario k6 dengan mock Xendit lokal agar benchmark
  deterministik dan tidak memakai kuota penyedia.
- **CI/CD** — format, lint, unit test, build, dan validasi Compose pada setiap
  push; delapan image container dibangun dan didorong ke GHCR saat `main`.

---

## 3. Tech Stack

| Lapisan | Teknologi | Alasan dipakai |
| --- | --- | --- |
| **Frontend** | Vue 3, TypeScript, Vite 7, Pinia, Vue Router, Naive UI, Tailwind CSS 4 | SPA cepat dengan kontrak API bertipe, library komponen untuk tabel admin yang kompleks, dan utility CSS untuk layout |
| **Lapisan API** | NestJS 11, REST/JSON, Passport JWT, Helmet, `express-rate-limit`, class-validator | Satu backend-for-frontend yang membentuk respons untuk UI dan menjauhkan gRPC dari browser |
| **Antar-service** | gRPC, Protocol Buffers, stub bertipe di `@ticketing/shared` | Kontrak ketat dan efisiensi biner antar service |
| **Data** | PostgreSQL 18, TypeORM, klien Redis 6, `redlock` | ACID per service, unique constraint sebagai penjaga terakhir, lock cepat yang kedaluwarsa sendiri |
| **Messaging** | RabbitMQ, topic exchange `ticketing.internal`, durable queue, manual ack | Memisahkan booking, payment, ticket, dan notification |
| **Integrasi** | Xendit (invoice, webhook, refund), Resend (email) | Siklus pembayaran yang realistis dengan penyedia asinkron |
| **Observability** | OpenTelemetry SDK, OTel Collector, Tempo, Prometheus, Grafana | Trace end-to-end melintasi HTTP, gRPC, dan event |
| **Tooling** | pnpm workspaces, Turborepo, Docker Compose, GitHub Actions, GHCR | Build monorepo, stack lokal yang reproduksibel, pemeriksaan dan image otomatis |
| **Pengujian** | Jest, Vitest, Playwright, k6 | Cakupan unit, komponen, browser, dan load |

---

## 4. Arsitektur

### Bentuk sistem

Browser hanya berbicara ke satu origin: REST gateway yang stateless. Gateway
adalah backend-for-frontend — ia menerjemahkan JSON menjadi panggilan gRPC,
menggabungkan katalog dan ketersediaan, menormalkan error gRPC menjadi semantik
HTTP, dan memegang middleware autentikasi. SPA tidak pernah tahu ada enam
service di belakangnya.

```mermaid
flowchart TB
    Web["Browser · Vue 3 SPA"] -->|REST + JWT| Gateway["API Gateway · :3000"]

    subgraph Services["NestJS services"]
        Gateway -->|gRPC| User["user-service · akun"]
        Gateway -->|gRPC| Cinema["cinema-service · katalog"]
        Gateway -->|gRPC command| Booking["booking-service · booking + seat lock"]
        Gateway -->|gRPC command| Payment["payment-service · pembayaran + Xendit"]
        Gateway -->|gRPC command| Ticket["ticket-service · tiket"]

        Booking -->|validasi kursi / harga| Cinema
        Booking -->|kontak pelanggan| User
        Booking -->|booking.*| MQ["RabbitMQ · ticketing.internal"]
        Payment -->|payment.*| MQ
        Ticket -->|tickets.*| MQ
        MQ -->|payment.*| Booking
        MQ -->|booking.*| Payment
        MQ -->|booking.confirmed / refunded| Ticket
        MQ -->|tickets.issued / payment.received| Notification["notification-service · email"]
    end

    subgraph PG["PostgreSQL · satu instance di development"]
        UserDB[(user_db)]
        CinemaDB[(cinema_db)]
        BookingDB[(booking_db)]
        PaymentDB[(payment_db)]
        TicketDB[(ticket_db)]
    end

    User --> UserDB
    Cinema --> CinemaDB
    Booking --> BookingDB
    Payment --> PaymentDB
    Ticket --> TicketDB

    Booking -->|seat lock| Redis[(Redis)]
    Payment -->|invoice / status / refund| Xendit["Xendit"]
    Web -->|hosted checkout| Xendit
    Xendit -->|webhook| Gateway
    Notification --> Resend["Resend"]
```

### Kepemilikan service

| Service | Memiliki | Command / tanggung jawab | Data |
| --- | --- | --- | --- |
| `gateway` | Tidak ada (stateless) | Routing REST, auth JWT, validasi DTO, agregasi respons, pintu webhook | — |
| `user-service` | Identitas | Registrasi, login, profil, role admin, lookup kontak | `user_db` |
| `cinema-service` | Katalog | Film, genre, teater, kursi, jadwal, harga, aturan overlap | `cinema_db` |
| `booking-service` | Siklus reservasi | Hold, cancel, list, availability, persiapan charge, cron expiry dan retry | `booking_db` + lock Redis |
| `payment-service` | State uang | Charge, webhook, sinkronisasi status, refund, rekonsiliasi pembayaran | `payment_db` |
| `ticket-service` | Tiket terbitan | Issue, void, list, lookup berdasarkan kode | `ticket_db` |
| `notification-service` | Tidak ada (stateless) | Konsumsi event, render dan kirim email | — |

### Saga booking

```mermaid
sequenceDiagram
    autonumber
    actor C as Pelanggan
    participant G as Gateway
    participant B as booking-service
    participant R as Redis
    participant X as Xendit
    participant P as payment-service
    participant T as ticket-service
    participant N as notification-service

    C->>G: POST /bookings/holds
    G->>B: Hold(showtime, kursi)
    B->>B: validasi kursi + harga via cinema-service
    B->>R: redlock seat:{showtimeId}:{seatId} × n (TTL 5 menit)
    B->>B: INSERT booking PENDING + snapshot kursi
    B-->>C: booking + expiresAt

    C->>G: POST /bookings/{id}/pay
    G->>B: PrepareCharge(booking)
    B-->>G: amount, currency, expiry, pelanggan
    G->>P: Charge(context)
    P->>X: buat hosted invoice
    P-->>C: checkoutUrl

    C->>X: bayar di halaman penyedia
    X->>G: webhook
    G->>P: Webhook(event)
    P->>P: tandai pembayaran SETTLED
    P-)B: payment.settled
    B->>R: lepas seat lock
    B-)T: booking.confirmed (snapshot kursi + film)
    T->>T: terbitkan tiket secara idempoten
    T-)B: tickets.issued
    B->>B: booking CONFIRMED
    B-)N: payment.received
    T-)N: tickets.issued
    N->>C: email tiket + kuitansi
```

Detail pentingnya adalah state **sudah dibayar tetapi tiket belum terbit**:
booking tetap `PENDING` dengan `paid_at` terisi sampai `tickets.issued` datang.
Jika ticket-service mati, event tetap antre, UI terus polling, dan tidak ada
state yang hilang. Cron terpisah mengirim ulang `booking.confirmed` untuk
booking yang tidak pernah menerima `tickets.issued`.

### Dua lapis melawan double-booking

| Lapis | Mekanisme | Sifat |
| --- | --- | --- |
| 1 | Redis `redlock` pada `seat:{showtimeId}:{seatId}`, TTL = jendela hold | Cepat, best-effort, kedaluwarsa otomatis |
| 2 | `UNIQUE (showtime_id, seat_id)` pada `booking_seats` | Jaminan keras dari PostgreSQL |

Ini jawaban sadar atas kritik terhadap Redlock: keamanan lock tidak
diasumsikan. Jika lock kedaluwarsa saat GC pause, unique constraint tetap
menolak penulisan kedua. Jika Redis tidak terjangkau, request gagal tertutup
dengan `503`, bukan berpura-pura kursi sudah diambil.

### Model konsistensi per domain

| Domain | Pilihan | Alasan |
| --- | --- | --- |
| Hold kursi | **CP** | Dua pelanggan memegang satu kursi adalah kegagalan bisnis; menolak satu request lebih baik daripada menerima keduanya |
| Settlement pembayaran | **CP via DB** | Unique constraint adalah garis terakhir, bahkan jika dua jalur (webhook + sync) berlomba |
| Browsing katalog | **AP** | Daftar film yang sedikit basi tidak berbahaya; ketersediaan lebih penting |
| Email / telemetri | **AP, eventual** | Email telat atau ganda tidak boleh menggagalkan booking yang sudah lunas |

Ini juga keputusan **PACELC**: saat tidak ada partisi, CinX memilih latensi
rendah (satu quorum Redis, satu panggilan gRPC, satu insert) dan membayar
konsistensi hanya ketika ada konflik (`409`) atau dependensi gagal (`503`).

### Penanganan kegagalan

| Kegagalan | Perilaku |
| --- | --- |
| Redis tidak tersedia | Hold gagal tertutup dengan `503 Seat lock unavailable` |
| Webhook Xendit ganda | Handler idempoten; tidak ada tiket atau refund dobel |
| `payment.settled` hilang | Polling `sync-payment` memperbaiki booking saat pengguna kembali |
| `booking.confirmed` hilang | Cron retry konfirmasi booking mengirim ulang event |
| `tickets.issued` hilang | Booking tetap paid-pending; cron retry membuat state konvergen |
| Pembayaran masuk setelah expiry | Booking mengirim `booking.refund.requested`; tiket tidak pernah diterbitkan |
| Refund gagal di penyedia | Booking kembali ke state berbayar; tiket tetap sah |
| RabbitMQ mati | Notifikasi bersifat best-effort; booking yang sudah dibayar tidak pernah dibatalkan karena email |
| Cancel ganda | `REFUND_PENDING` / `REFUNDED` mengembalikan `409`, jadi refund kedua tidak pernah dikirim |

Refund mengikuti satu aturan: **jangan pernah menyebut `REFUNDED` sebelum
penyedia menyatakan berhasil.** Selama `REFUND_PENDING`, booking tetap lunas
dalam segala hal yang penting — kursi masih `BOOKED` dan tiket masih berlaku.

### Observability dan delivery

- Setiap service backend mengekspor trace dan metrik OTLP ke OTel Collector.
- Tempo menyimpan trace, Prometheus menyimpan metrik, Grafana menampilkan
  keduanya.
- Klien Vue mempropagasikan `traceparent`, sehingga satu klik bisa diikuti dari
  gateway → gRPC → event → ticket dalam satu trace.
- Sampling default 20%, karena observability tidak boleh mendominasi hot path.
- CI memvalidasi format, lint, unit test, build, dan kedua file Compose.
- CD membangun delapan image dan mempublikasikannya ke GitHub Container
  Registry.

---

## 5. ERD

Lima database, satu per service pemilik data. Referensi lintas database bersifat
**logis** — garis putus-putus di bawah — dan tidak ada foreign key lintas
database. `booking_seats` tetap memiliki FK lokal ke `bookings` karena keduanya
berada di `booking_db`.

```mermaid
erDiagram
    USERS {
        uuid id PK
        varchar email UK
        varchar name
        varchar password_hash
        enum role
        timestamptz created_at
    }

    MOVIES {
        uuid id PK
        varchar title
        text synopsis
        int duration_minutes
        enum age_rating
        varchar poster_url
        date release_date
        enum status
    }

    GENRES {
        uuid id PK
        varchar name UK
    }

    MOVIE_GENRES {
        uuid movie_id PK
        uuid genre_id PK
    }

    THEATERS {
        uuid id PK
        varchar name
        varchar address
    }

    SEATS {
        uuid id PK
        uuid theater_id FK
        varchar row_label
        int seat_number
        enum category
        boolean is_accessible
        boolean is_disabled
    }

    SHOWTIMES {
        uuid id PK
        uuid movie_id FK
        uuid theater_id FK
        timestamptz starts_at
        bigint price_amount
        char price_currency
    }

    BOOKINGS {
        uuid id PK
        uuid user_id
        uuid showtime_id
        varchar movie_title
        varchar theater_name
        timestamptz starts_at
        bigint total_amount
        enum status
        varchar cancellation_reason
        timestamptz expires_at
        timestamptz paid_at
        timestamptz confirmed_at
        timestamptz tickets_issued_at
    }

    BOOKING_SEATS {
        uuid id PK
        uuid booking_id FK
        uuid showtime_id
        uuid seat_id
        varchar row_label
        int seat_number
        enum category
        bigint price_amount
        char price_currency
    }

    PAYMENTS {
        uuid id PK
        uuid booking_id UK
        varchar external_id
        varchar provider_txn_id
        bigint amount
        enum method
        enum status
        varchar invoice_id
        varchar checkout_url
        varchar refund_id
        timestamptz paid_at
        timestamptz refunded_at
    }

    TICKETS {
        uuid id PK
        uuid booking_id
        uuid user_id
        uuid showtime_id
        varchar code UK
        varchar movie_title
        varchar theater_name
        timestamptz starts_at
        varchar seat_id
        varchar row_label
        int seat_number
    }

    MOVIES ||--o{ MOVIE_GENRES : "memiliki genre"
    GENRES ||--o{ MOVIE_GENRES : "mengklasifikasi"
    MOVIES ||--o{ SHOWTIMES : "dijadwalkan sebagai"
    THEATERS ||--o{ SEATS : "berisi"
    THEATERS ||--o{ SHOWTIMES : "menyelenggarakan"
    BOOKINGS ||--|{ BOOKING_SEATS : "mencakup"
    USERS ||..o{ BOOKINGS : "memiliki (logis)"
    SHOWTIMES ||..o{ BOOKINGS : "dipesan untuk (logis)"
    SEATS ||..o{ BOOKING_SEATS : "snapshot dari (logis)"
    BOOKINGS ||..|| PAYMENTS : "dibayar oleh (logis)"
    BOOKINGS ||..o{ TICKETS : "diterbitkan sebagai (logis)"
```

### Constraint yang membawa makna bisnis

| Constraint | Tujuan |
| --- | --- |
| `booking_seats UNIQUE (showtime_id, seat_id)` | Penjaga keras double-booking |
| Enum `bookings.status` | `PENDING`, `CONFIRMED`, `EXPIRED`, `CANCELLED`, `REFUND_PENDING`, `REFUNDED` |
| `bookings.cancellation_reason` | Memisahkan pembatalan pelanggan dari penolakan pembayaran |
| `payments.booking_id UNIQUE` | Satu record pembayaran per booking |
| `payments.external_id` | Referensi kita ke penyedia (`cix-{bookingId}`), bukan ID penyedia |
| `tickets.code UNIQUE` | Kode akses publik yang mudah dibaca |
| `tickets UNIQUE (booking_id, seat_id)` | Satu tiket per kursi yang dibayar, bahkan saat event diputar ulang |
| `seats UNIQUE (theater_id, row_label, seat_number)` | Tidak ada kursi fisik ganda |
| Aturan overlap `showtimes` | Ditegakkan di aplikasi per teater, memakai durasi film |

### Catatan desain

- **Snapshot, bukan join.** Record booking menyimpan judul film, nama teater,
  waktu mulai, serta snapshot kursi dan harga. Riwayat tetap benar meskipun
  katalog berubah kemudian, dan penerbitan tiket tidak bergantung pada uptime
  cinema-service.
- **Ketersediaan diturunkan, tidak disimpan.** Kursi berstatus `BOOKED` ketika
  dimiliki booking `CONFIRMED` atau `REFUND_PENDING`, `HELD` ketika booking
  `PENDING` belum kedaluwarsa dan lock Redis masih hidup, dan `AVAILABLE` jika
  tidak keduanya. Kursi yang di-refund bisa dijual lagi, dan unique guard tetap
  mengizinkannya karena baris booking lama dibersihkan pada hold berikutnya.
- **Batal berbeda dari kedaluwarsa.** `EXPIRED` berarti jendela hold habis;
  `CANCELLED` berarti ada yang memutuskan, dengan alasan `CUSTOMER` atau
  `PAYMENT_DECLINED`. Mencampur keduanya menghilangkan perbedaan antara
  funnel abandonment dan masalah pembayaran.
- **Identifier pembayaran dibedakan.** `external_id` milik kita, `invoice_id`
  milik hosted invoice, dan `provider_txn_id` adalah ID settlement penyedia —
  yang bisa tetap `NULL` untuk Invoices API.

---

## 6. Trade-off

Setiap keputusan arsitektur di sini punya harga. Yang penting adalah mengetahui
harganya.

| Keputusan | Yang didapat | Yang dibayar | Cara dibatasi |
| --- | --- | --- | --- |
| **Microservices + gRPC** dibanding modular monolith | Batas kepemilikan eksplisit, deploy dan scaling independen, kontrak ketat | Tujuh proses backend untuk satu produk; koordinasi dan failure mode lebih banyak | Proto bertipe di package bersama, gateway sebagai satu-satunya router sinkron |
| **Database per service** | Data ownership nyata; booking/payment/ticket bisa berevolusi tanpa menyentuh cinema | Tidak ada join atau FK lintas DB; tidak bisa satu transaksi lintas domain | Referensi logis, snapshot saat tulis, validasi gRPC sebelum menulis |
| **Lock Redis + constraint DB** | Hold cepat dengan expiry otomatis, plus jaminan yang bertahan saat lock gagal | Dua sistem untuk dioperasikan; Redis satu instance di Compose | `503` fail-closed, unique index sebagai pagar terakhir, handler idempoten |
| **Pembayaran asinkron** | Mengikuti penyedia tanpa memblokir pengguna; menangani settlement terlambat | Webhook bisa telat, ganda, atau hilang | Polling sync-payment, cron retry, idempotensi, refund otomatis untuk late settlement |
| **Event domain RabbitMQ** | Booking, payment, dan ticket tetap terpisah; satu event bisa fan-out | Kontrak event, urutan, duplikasi, dan poison message menjadi tanggung jawab sendiri | Durable queue, manual ack, consumer idempoten, cron retry |
| **Orkestrasi saga** | Satu tempat untuk membaca siklus booking; satu trace end-to-end | `booking-service` memegang state saga dan harus tahan event ganda | State machine eksplisit, marker retry, langkah kompensasi refund |
| **Gateway BFF** | SPA mendapat satu API yang dibentuk untuk UI; gRPC tetap internal | Satu hop tambahan (~1–5 ms) dan satu komponen lagi untuk di-scale | Gateway stateless, agregasi sederhana, error ternormalisasi |
| **Fallback seat map** | Halaman tetap tampil saat booking-service mati | Kursi bisa terlihat tersedia | Server memvalidasi ulang setiap kursi saat hold |
| **TypeORM `synchronize`** | Iterasi schema cepat selama development | Tidak ada riwayat migrasi, tidak aman untuk produksi | Didokumentasikan sebagai keterbatasan; migrasi masuk rencana |
| **Belum ada outbox / DLQ** | Sistem lebih sederhana selama permukaan event masih kecil | Crash antara commit DB dan publish bisa kehilangan event | Cron rekonsiliasi dan replay idempoten; outbox + DLQ adalah langkah berikutnya |
| **Satu instance per dependensi** | Stack lokal reproduksibel, demo mudah | Tidak ada high availability; outage menghentikan penulisan | Perilaku fail-closed dan probe ketersediaan; HA produksi didokumentasikan terpisah |

### Yang akan diubah pada skala produksi

- Menambahkan **transactional outbox** agar commit database dan publish event
  tidak pernah berbeda, plus dead-letter queue dengan retry terbatas dan
  alerting.
- Mengganti `synchronize` dengan **migrasi berversi**, backup teruji, dan
  simulasi restore.
- Menjalankan Redis sebagai Sentinel atau Cluster dan PostgreSQL dengan
  replika/failover; lock dan penulisan saat ini mengasumsikan satu node sehat.
- Mempublikasikan angka benchmark yang reproduksibel per level, termasuk titik
  knee dan bottleneck-nya, bukan hanya harness. Suite k6 sudah mendukung
  matriks 100 / 500 / 1.000 VU, open-loop read, contention, dan failure
  injection terhadap mock Xendit.
- Menguji jalur refund dan late settlement terhadap Xendit di staging, bukan
  hanya terhadap mock lokal.

Ringkasan jujurnya: untuk jaringan bioskop nyata, topologi ini
_over-engineered_ pada skala kecil. Proyek ini ada untuk menunjukkan batas
domain, failure mode, dan penalaran konsistensi yang benar-benar dibutuhkan
produk tiket dengan rebutan kursi — sekaligus membuktikan bahwa pilihan itu bisa
dipertanggungjawabkan, bukan hanya digambar.

---

## 7. Kesimpulan

CinX adalah studi tentang membuat satu invariant mustahil dilanggar: **kursi
tidak pernah terjual dua kali, dan uang tidak pernah berpindah tanpa perubahan
state yang sepadan.**

Desainnya mencapainya lewat lapisan, bukan kepercayaan:

- Redis membuat kasus umum cepat dan kedaluwarsa sendiri.
- PostgreSQL membuat kasus yang salah menjadi mustahil.
- Snapshot menjaga riwayat tetap benar melintasi batas service.
- Event memisahkan konfirmasi dan penerbitan tiket tanpa kehilangan booking.
- Retry dan rekonsiliasi membuat kegagalan asinkron konvergen, bukan merusak
  state.
- Refund adalah kompensasi, bukan pembalikan status: kursi dan tiket mengikuti
  uang.

Proyek ini juga menunjukkan separuh sisi backend yang jarang terlihat: kontrak
bertipe di package bersama, BFF stateless, semantik `409` versus `503` yang
jujur, consumer idempoten, propagasi trace dari browser sampai event, dan
strategi pengujian yang mencakup unit, integration, browser, serta load test.

Hasilnya bukan klaim siap produksi. Ini sistem yang berjalan dengan batas yang
didokumentasikan, trade-off yang disengaja, dan daftar jelas tentang apa yang
harus berubah sebelum trafik nyata dan uang nyata bergantung padanya.

### Bacaan lanjutan

- [`README.md`](../../README.md) — quick start dan alur booking
- [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) — analisis CAP/PACELC dan glosarium
- [`docs/ERD.md`](../ERD.md) — model data lengkap per kolom
- [`docs/openapi.yaml`](../openapi.yaml) — kontrak REST
- [`CONTEXT.md`](../../CONTEXT.md) — bahasa domain bersama
- [`benchmark/README.md`](../../benchmark/README.md) — skenario k6 dan metodologi
