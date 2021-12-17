const bytesToWordArray = (bytes) => {
  const words = new Array(Math.ceil(bytes.length / 4))
  for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
    const byteIndex = wordIndex * 4
    words[wordIndex] = ((((((((0
      << 8) | bytes[byteIndex + 0])
      << 8) | bytes[byteIndex + 1])
      << 8) | bytes[byteIndex + 2])
      << 8) | bytes[byteIndex + 3])
  }
  return CryptoJS.lib.WordArray.create(words, bytes.length)
}

const wordArrayToBytes = (wordArray) => {
  const bytes = new Uint8Array(wordArray.sigBytes)
  const words = wordArray.words
  for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
    const word = words[wordIndex]
    const byteIndex = wordIndex * 4
    bytes[byteIndex + 0] = (word >> 24) & 0xff
    bytes[byteIndex + 1] = (word >> 16) & 0xff
    bytes[byteIndex + 2] = (word >> 8) & 0xff
    bytes[byteIndex + 3] = (word >> 0) & 0xff
  }
  return bytes
}

const bytesToText = (bytes) => {
  return new TextDecoder().decode(bytes)
}

const textToBytes = (text) => {
  return new TextEncoder().encode(text)
}

const equalArrays = (a, b) => {
  if (a.length !== b.length) {
    return false
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false
    }
  }
  return true
}

const getMD5 = (bytes) => {
  return wordArrayToBytes(CryptoJS.MD5(bytesToWordArray(bytes)))
}

const verify = (bytes) => {
  const integrity = bytes.slice(0, 16)
  for (let i = 0; i < 8; i++) {
    const hash = bytes.slice(16, bytes.length - i)
    if (!equalArrays(integrity, hash)) {
      return
    }
  }
  throw new Error('MD5 hash check failed.')
}

const verify_ac1350 = (bytes, littleEndian) => {
  const integrity = bytes.slice(0, 16)
  const dataView = new DataView(bytes.buffer)
  const length = dataView.getUint16(16, littleEndian)
  const hash = getMD5(bytes.slice(20, length))
  if (!equalArrays(integrity, hash)) {
    throw new Error('MD5 hash check failed.')
  }
}

const isLittleEndian = (bytes) => {
  const dataView = new DataView(bytes.buffer)
  const littleEndian = true
  if (dataView.getUint16(0, littleEndian) > 0x20000) {
    if (dataView.getUint16(0, !littleEndian) > 0x20000) {
      throw new Error('Config size is too large.')
    }
    return !littleEndian
  }
  return littleEndian
}

const uncompress = (bytes, littleEndian) => {
  const get_bit = () => {
    if (block16_countdown) {
      block16_countdown -= 1
    } else {
      block16_dict_bits = dataView.getUint16(s_p, littleEndian)
      s_p += 2
      block16_countdown = 0xF
    }
    block16_dict_bits = block16_dict_bits << 1

    if (block16_dict_bits & 0x10000) {
      return 1
    } else {
      // went past bit
      return 0
    }
  }

  const get_dict_ld = () => {
    let bits = 1
    do {
      bits = (bits << 1) + get_bit()
    } while (get_bit())
    return bits
  }

  const dataView = new DataView(bytes.buffer)

  let block16_countdown = 0 // 16 byte blocks
  let block16_dict_bits = 0 // bits for dictionnary bytes

  let size = dataView.getUint32(0, littleEndian)
  let dst = new Uint8Array(size)
  let s_p = 4
  let d_p = 0

  dst[d_p] = bytes[s_p]
  s_p += 1
  d_p += 1

  while (d_p < size) {
    if (get_bit()) {
      let num_chars = get_dict_ld() + 2
      let msB = (get_dict_ld() - 2) << 8
      let lsB = bytes[s_p]
      s_p += 1
      let offset = d_p - (lsB + 1 + msB)
      for (let i = 0; i < num_chars; i += 1) {
        // 1 by 1 ∵ sometimes copying previously copied byte
        dst[d_p] = dst[offset]
        d_p += 1
        offset += 1
      }
    } else {
      dst[d_p] = bytes[s_p]
      s_p += 1
      d_p += 1
    }
  }
  return dst
}

const boolToBit = (bool) => {
  return bool ? 1 : 0
}

const compress = (src, littleEndian, skiphits = false) => {
  const put_bit = (bit) => {
    if (block16_countdown) {
      block16_countdown -= 1
    } else {
      dataView.setUint16(d_pb, block16_dict_bits, littleEndian)
      d_pb = d_p
      d_p += 2
      block16_countdown = 0xF
    }
    block16_dict_bits = (bit + (block16_dict_bits << 1)) & 0xFFFF
  }

  const put_dict_ld = (bits) => {
    let ldb = bits >> 1
    while (true) {
      let lb = (ldb - 1) & ldb
      if (!lb) {
        break
      }
      ldb = lb
    }
    put_bit(boolToBit((ldb & bits) > 0))
    ldb = ldb >> 1
    while (ldb) {
      put_bit(1)
      put_bit(boolToBit((ldb & bits) > 0))
      ldb = ldb >> 1
    }
    put_bit(0)
  }

  const hash_key = (offset) => {
    let b4 = src.slice(offset, offset + 4)
    let hk = 0
    for (let b of b4.slice(0, 3)) {
      hk = (hk + b) * 0x13d
    }
    return ((hk + b4[3]) & 0x1FFF)
  }

  const hash_table = new Map()
  const size = src.length

  const dst = new Uint8Array(0x8000)   // max compressed buffer size
  const dataView = new DataView(dst.buffer)

  let buffer_countdown = size
  let block16_countdown = 0x10  // 16 byte blocks
  let block16_dict_bits = 0     // bits for dictionnary bytes

  dataView.setUint32(0, size, littleEndian) // Store original size
  dst[4] = src[0]                     // Copy first byte
  buffer_countdown -= 1
  let s_p = 1
  let s_ph = 0
  let d_pb = 5
  let d_p = 7

  while (buffer_countdown > 4) {
    while (s_ph < s_p) {
      hash_table.set(hash_key(s_ph), s_ph)
      s_ph += 1
    }
    let hit = hash_table.get(hash_key(s_p))
    let count = 0
    if (hit) {
      while (true) {
        if (src[hit + count] !== src[s_p + count]) {
          break
        }
        count += 1
        if (count === buffer_countdown) {
          break
        }
      }
      if (count >= 4 || count === buffer_countdown) {
        hit = s_p - hit - 1
        put_bit(1)
        put_dict_ld(count - 2)
        put_dict_ld((hit >> 8) + 2)
        dst[d_p] = hit & 0xFF
        d_p += 1
        buffer_countdown -= count
        s_p += count
        if (skiphits) {
          hash_table.set(hash_key(s_ph), s_ph)
          s_ph += count
        }
        continue
      }
    }
    put_bit(0)
    dst[d_p] = src[s_p]
    s_p += 1
    d_p += 1
    buffer_countdown -= 1
  }

  while (buffer_countdown) {
    put_bit(0)
    dst[d_p] = src[s_p]
    s_p += 1
    d_p += 1
    buffer_countdown -= 1
  }
  dataView.setUint16(d_pb, (block16_dict_bits << block16_countdown) & 0xFFFF, littleEndian)
  return dst.slice(0, d_p)
}

const pack = (littleEndian, ...values) => {
  const a = new Uint8Array(values.length)
  const dv = new DataView(a.buffer)
  values.forEach((value, i) => {
    dv.setUint16(i, value, littleEndian)
  })
  return a
}

const encodeXML = (xml) => {
  let trimmed = xml.trim()
  if (trimmed[trimmed.length - 1] !== '\0') {
    // Always end with NULL
    trimmed += '\0'
  }
  return textToBytes(trimmed)
}

const decodeXML = (bytes) => {
  if (bytes[bytes.length - 1] === 0) {
    // Replace NULL with LF
    bytes[bytes.length - 1] = 0xa
  }
  return bytesToText(bytes)
}

const encodeConfigToCipherParams = (xml, littleEndian) => {
  const encodedXML = encodeXML(xml)
  const compressedXML = compress(encodedXML, littleEndian, false)
  const hash = getMD5(compressedXML)

  const combinedSize = hash.length + compressedXML.length
  const lengthPadding = combinedSize % 8 ? 8 - combinedSize % 8 : 0
  const bin = new Uint8Array(combinedSize + lengthPadding)
  bin.set(hash)
  bin.set(compressedXML, hash.length)

  return CryptoJS.DES.encrypt(
    bytesToWordArray(bin),
    desKey,
    desOptions
  )
}

const decodeConfigFromCipherParams = async (cipherParams) => {
  const plaintext = CryptoJS.DES.decrypt(cipherParams, desKey, desOptions)
  const config = wordArrayToBytes(plaintext)
  const littleEndian = isLittleEndian(config)

  const configFormat = configFormats.find(cf => cf.test(config))
  if (!configFormat) {
    throw new Error('Unrecognised config format.')
  }
  console.log({ configFormat: configFormat.name })

  const xmlBytes = configFormat.extractXML(config, littleEndian)
  const xml = decodeXML(xmlBytes)
  return { xml, littleEndian }
}

const decodeConfigFromFile = async (file) => {
  if (file.size % 8 !== 0) {
    throw new Error(`Invalid config size. Must be multiple of 8. ${file.size}`)
  }

  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const cipherParams = CryptoJS.lib.CipherParams.create({
    ciphertext: bytesToWordArray(bytes)
  })
  return decodeConfigFromCipherParams(cipherParams)
}

const configFormats = [
  {
    name: 'Uncompressed',
    test: config => bytesToText(config.slice(16, 21)) === '<?xml',
    extractXML: config => {
      verify(config)
      return config.slice(16)
    }
  },
  {
    name: 'W9970',
    test: config => bytesToText(config.slice(20, 27)) === '<\0\0?xml',
    extractXML: (config, littleEndian) => {
      verify(config)
      const compressed = config.slice(16)
      return uncompress(compressed, littleEndian)
    }
  },
  {
    name: 'W9980/W8980',
    test: config => bytesToText(config.slice(22, 29)) === '<\0\0?xml',
    extractXML: (config, littleEndian) => {
      const uncompressed = uncompress(config, littleEndian)
      verify(uncompressed)
      return uncompressed.slice(16)
    }
  },
  {
    name: 'AC1350',
    test: config => bytesToText(config.slice(24, 31)) === '<\0\0?xml',
    extractXML: (config, littleEndian) => {
      verify_ac1350(config, littleEndian)
      return uncompress(config, littleEndian)
    }
  }
]

const desKey = CryptoJS.enc.Hex.parse('478da50bf9e3d2cf')
const desOptions = {
  mode: CryptoJS.mode.ECB,
  padding: CryptoJS.pad.NoPadding
}

const importButton = document.getElementById("IMPORT")
const importInput = document.getElementById("FILE")
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
  importInput.click()
})

importInput.addEventListener('change', async (e) => {
  e.preventDefault()
  await handleImportEvent(importInput.files[0])
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
