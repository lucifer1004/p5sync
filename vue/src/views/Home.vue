<template>
  <div class="home">
    <Board />
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import Board from '@/components/Board.vue' // @ is an alias to /src

export default Vue.extend({
  name: 'home',
  components: {
    Board,
  },
})
</script>
