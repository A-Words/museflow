import { expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ScaffoldCheck from '../../app/components/ScaffoldCheck.vue'

it('mounts the Nuxt UI form with an accessible input and action', async () => {
  const wrapper = await mountSuspended(ScaffoldCheck)
  expect(wrapper.text()).toContain('组件交互检查')
  expect(wrapper.find('input').attributes('placeholder')).toBe('输入用于检查的名称')
  await wrapper.find('input').setValue('MuseFlow')
  expect((wrapper.find('input').element as HTMLInputElement).value).toBe('MuseFlow')
  expect(wrapper.find('button[type="submit"]').text()).toBe('检查弹窗')
  wrapper.unmount()
})
