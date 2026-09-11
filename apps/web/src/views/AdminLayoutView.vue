<script setup lang="ts"></script>

<template>
  <h1 class="bx-h1 mb-5">Operator console</h1>
  <nav class="bx-tabs" aria-label="Admin">
    <router-link class="bx-tab" to="/admin/movies">Movies</router-link>
    <router-link class="bx-tab" to="/admin/theaters">Theaters</router-link>
    <router-link class="bx-tab" to="/admin/showtimes">Showtimes</router-link>
  </nav>
  <router-view />
</template>