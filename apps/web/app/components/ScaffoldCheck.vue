<script setup lang="ts">
import { z } from 'zod'

const schema = z.object({ name: z.string().trim().min(1, '请输入名称') })
const state = reactive({ name: '' })
const open = ref(false)
const submittedName = ref('')

function submit() {
  submittedName.value = state.name.trim()
  open.value = true
}
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="text-lg font-semibold">组件交互检查</h2>
    </template>
    <UForm :schema="schema" :state="state" class="space-y-4" @submit="submit">
      <UFormField label="名称" name="name">
        <UInput v-model="state.name" placeholder="输入用于检查的名称" />
      </UFormField>
      <UButton type="submit">检查弹窗</UButton>
    </UForm>
    <UModal v-model:open="open" title="交互正常" description="此操作只检查页面交互，不保存数据。">
      <template #body>
        <p>你好，{{ submittedName }}。</p>
        <UButton class="mt-4" @click="open = false">关闭</UButton>
      </template>
    </UModal>
  </UCard>
</template>
