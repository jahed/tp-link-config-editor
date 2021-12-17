import { decodeConfig, encodeConfig } from './js/config.js'

const download = (file) => {
  const url = URL.createObjectURL(file)
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  window.open(url)
}

const handleImportEvent = async (file) => {
  try {
    const config = await decodeConfig(file)
    resultTextArea.value = config.xml
    littleEndianCheckbox.checked = config.littleEndian
  } catch (error) {
    console.error('Failed to import config.', error)
    alert(`Failed to import config. ${error}`)
  }
}

const importButton = document.getElementById("IMPORT")
const importFileInput = document.getElementById("FILE")
const exportButton = document.getElementById("EXPORT")
const resultTextArea = document.getElementById("RESULT")
const littleEndianCheckbox = document.getElementById("LITTLE_ENDIAN")

importButton.addEventListener('click', () => {
  importFileInput.click()
})

importFileInput.addEventListener('change', async (event) => {
  event.preventDefault()
  await handleImportEvent(importFileInput.files[0])
})

resultTextArea.addEventListener('drop', async (event) => {
  event.preventDefault()
  await handleImportEvent(event.dataTransfer.files[0])
})

resultTextArea.addEventListener('dragover', (event) => {
  event.preventDefault()
  event.dataTransfer.dropEffect = 'copy'
})

exportButton.addEventListener('click', async () => {
  try {
    download(
      await encodeConfig({
        littleEndian: littleEndianCheckbox.checked,
        xml: resultTextArea.value
      })
    )
  } catch (error) {
    console.error('Failed to export config.', error)
    alert(`Failed to export config. ${error}`)
  }
})
