import { reactive } from 'vue'

export const ui = reactive({
  settingsOpen: false,
  modelPicker: { open: false, reason: '' },
})

export function openModelPicker(reason = ''): void {
  ui.modelPicker.open = true
  ui.modelPicker.reason = reason
}

export function closeModelPicker(): void {
  ui.modelPicker.open = false
  ui.modelPicker.reason = ''
}
