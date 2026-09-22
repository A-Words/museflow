<script setup lang="ts">
import { healthSchema } from '#shared/contracts/health'

const config = useRuntimeConfig()
useHead({ title: `${config.public.appName} · 开发骨架` })
const { data, error } = await useFetch('/api/v1/health', {
  transform: value => healthSchema.parse(value),
})
</script>

<template>
  <main class="mx-auto max-w-2xl space-y-8 px-6 py-16">
    <header class="space-y-3">
      <p class="text-sm text-muted">MF-04 · 开发环境</p>
      <h1 class="text-4xl font-bold">{{ config.public.appName }}</h1>
      <p>Nuxt 项目骨架。业务功能尚未接入。</p>
      <p role="status">{{ error ? 'Web 健康检查失败' : `Web 进程：${data?.status}` }}</p>
      <p class="text-sm text-muted">此状态不代表数据库或生成服务可用。</p>
    </header>
    <ScaffoldCheck />
  </main>
</template>
