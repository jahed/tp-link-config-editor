import { decodeConfigFromFile, encodeConfigToCipherParams, decodeConfigFromCipherParams } from './js/config.js'
import { wordArrayToBytes } from './js/bytes.js'

const importButton = document.getElementById("IMPORT")
const importFileInput = document.getElementById("FILE")
const exportButton = document.getElementById("EXPORT")
const resultTextArea = document.getElementById("RESULT")
const littleEndianCheckbox = document.getElementById("LITTLE_ENDIAN")

const handleImportEvent = async (file) => {
  try {
    const { xml, littleEndian } = await decodeConfigFromFile(file)
    resultTextArea.value = xml
    littleEndianCheckbox.checked = littleEndian
  } catch (error) {
    console.error('Failed to import config.', error)
    alert(`Failed to import config. ${error}`)
  }
}

importButton.addEventListener('click', () => {
  importFileInput.click()
})

importFileInput.addEventListener('change', async (e) => {
  e.preventDefault()
  await handleImportEvent(importFileInput.files[0])
})

resultTextArea.addEventListener('drop', async (e) => {
  e.preventDefault()
  await handleImportEvent(e.dataTransfer.files[0])
})

resultTextArea.addEventListener('dragover', async (e) => {
  e.preventDefault()
  e.dataTransfer.dropEffect = 'copy'
})

exportButton.addEventListener('click', async () => {
  try {
    const cipherParams = await encodeConfigToCipherParams(resultTextArea.value, littleEndianCheckbox.checked)

    const { xml, littleEndian } = await decodeConfigFromCipherParams(cipherParams)
    if (xml !== resultTextArea.value) {
      throw new Error('Exported XML does not match editor.')
    }
    if (littleEndian !== littleEndianCheckbox.checked) {
      throw new Error('Exported endianness does not match editor.')
    }

    const config = wordArrayToBytes(cipherParams.ciphertext)
    const file = new File([config.buffer], "config.bin", { type: 'application/octet-stream' })
    const url = URL.createObjectURL(file)
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    window.open(url)
  } catch (error) {
    console.error('Failed to export config.', error)
    alert(`Failed to export config. ${error}`)
  }
})
