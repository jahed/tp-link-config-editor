import { boolToBit, bytesToDataView, bytesToText, bytesToWordArray, equalArrays, getMD5, textToBytes, wordArrayToBytes } from './bytes.js'

const desKey = CryptoJS.enc.Hex.parse('478da50bf9e3d2cf')
const desOptions = {
  mode: CryptoJS.mode.ECB,
  padding: CryptoJS.pad.NoPadding
}

const configFormats = [
  {
    name: 'Uncompressed',
    test: config => bytesToText(config.subarray(16, 21)) === '<?xml',
    extractXML: config => {
      verifyIntegrity(config)
      return config.subarray(16)
    }
  },
  {
    name: 'W9970',
    test: config => bytesToText(config.subarray(20, 27)) === '<\0\0?xml',
    extractXML: (config, littleEndian) => {
      verifyIntegrity(config)
      const compressed = config.subarray(16)
      return uncompressBytes(compressed, littleEndian)
    }
  },
  {
    name: 'W9980/W8980',
    test: config => bytesToText(config.subarray(22, 29)) === '<\0\0?xml',
    extractXML: (config, littleEndian) => {
      const uncompressed = uncompressBytes(config, littleEndian)
      verifyIntegrity(uncompressed)
      return uncompressed.subarray(16)
    }
  },
  {
    name: 'AC1350',
    test: config => bytesToText(config.subarray(24, 31)) === '<\0\0?xml',
    extractXML: (config, littleEndian) => {
      verifyIntegrityAC1350(config, littleEndian)
      return uncompressBytes(config, littleEndian)
    }
  }
]

const getConfigFormat = (config) => {
  const configFormat = configFormats.find(cf => cf.test(config))
  if (!configFormat) {
    throw new Error('Unrecognised config format.')
  }
  return configFormat
}

const verifyIntegrity = (bytes) => {
  const integrity = bytes.subarray(0, 16)
  for (let i = 0; i < 8; i++) {
    const hash = getMD5(bytes.subarray(16, bytes.length - i))
    if (equalArrays(integrity, hash)) {
      return
    }
  }
  throw new Error('MD5 hash check failed.')
}

const verifyIntegrityAC1350 = (bytes, littleEndian) => {
  const integrity = bytes.subarray(0, 16)
  const dataView = bytesToDataView(bytes)
  const length = dataView.getUint16(16, littleEndian)
  const hash = getMD5(bytes.subarray(20, length))
  if (!equalArrays(integrity, hash)) {
    throw new Error('MD5 hash check failed.')
  }
}

const isLittleEndian = (bytes) => {
  const dataView = bytesToDataView(bytes)
  const littleEndian = true
  if (dataView.getUint16(0, littleEndian) > 0x20000) {
    if (dataView.getUint16(0, !littleEndian) > 0x20000) {
      throw new Error('Config size is too large.')
    }
    return !littleEndian
  }
  return littleEndian
}

const uncompressBytes = (src, littleEndian) => {
  const getBit = () => {
    if (block16Countdown) {
      block16Countdown -= 1
    } else {
      block16DictBits = srcView.getUint16(srcP, littleEndian)
      srcP += 2
      block16Countdown = 0xF
    }
    block16DictBits = block16DictBits << 1

    if (block16DictBits & 0x10000) {
      return 1
    } else {
      // went past bit
      return 0
    }
  }

  const getDictLD = () => {
    let bits = 1
    do {
      bits = (bits << 1) + getBit()
    } while (getBit())
    return bits
  }

  const srcView = bytesToDataView(src)

  let block16Countdown = 0 // 16 byte blocks
  let block16DictBits = 0 // bits for dictionnary bytes

  let size = srcView.getUint32(0, littleEndian)
  let dst = new Uint8Array(size)
  let srcP = 4
  let dstP = 0

  dst[dstP] = src[srcP]
  srcP += 1
  dstP += 1

  while (dstP < size) {
    if (getBit()) {
      let charsCount = getDictLD() + 2
      let msB = (getDictLD() - 2) << 8
      let lsB = src[srcP]
      srcP += 1
      let offset = dstP - (lsB + 1 + msB)
      for (let i = 0; i < charsCount; i += 1) {
        // 1 by 1 ∵ sometimes copying previously copied byte
        dst[dstP] = dst[offset]
        dstP += 1
        offset += 1
      }
    } else {
      dst[dstP] = src[srcP]
      srcP += 1
      dstP += 1
    }
  }
  return dst
}

const createHashTable = (src) => {
  const getHashKey = (offset) => {
    let b4 = src.subarray(offset, offset + 4)
    let hk = 0
    for (let b of b4.subarray(0, 3)) {
      hk = (hk + b) * 0x13d
    }
    return ((hk + b4[3]) & 0x1FFF)
  }

  const map = new Map()

  return {
    get: (srcP) => map.get(getHashKey(srcP)),
    set: (srcPH) => map.set(getHashKey(srcPH), srcPH)
  }
}

const compressBytes = (src, littleEndian, skiphits = false) => {
  const putBit = (bit) => {
    if (block16Countdown) {
      block16Countdown -= 1
    } else {
      dstView.setUint16(dstPB, block16DictBits, littleEndian)
      dstPB = dstP
      dstP += 2
      block16Countdown = 0xF
    }
    block16DictBits = (bit + (block16DictBits << 1)) & 0xFFFF
  }

  const putDictLD = (bits) => {
    let ldb = bits >> 1
    while (true) {
      let lb = (ldb - 1) & ldb
      if (!lb) {
        break
      }
      ldb = lb
    }
    putBit(boolToBit((ldb & bits) > 0))
    ldb = ldb >> 1
    while (ldb) {
      putBit(1)
      putBit(boolToBit((ldb & bits) > 0))
      ldb = ldb >> 1
    }
    putBit(0)
  }

  const hashTable = createHashTable(src)
  const size = src.length

  const dst = new Uint8Array(0x8000) // max compressed buffer size
  const dstView = bytesToDataView(dst)

  dstView.setUint32(0, size, littleEndian)
  dst[4] = src[0]

  let bufferCountdown = size - 1
  let block16Countdown = 0x10 // 16 byte blocks
  let block16DictBits = 0 // bits for dictionnary bytes

  let srcP = 1
  let srcPH = 0
  let dstPB = 5
  let dstP = 7

  while (bufferCountdown > 4) {
    while (srcPH < srcP) {
      hashTable.set(srcPH)
      srcPH += 1
    }
    let hit = hashTable.get(srcP)
    let count = 0
    if (hit) {
      while (true) {
        if (src[hit + count] !== src[srcP + count]) {
          break
        }
        count += 1
        if (count === bufferCountdown) {
          break
        }
      }
      if (count >= 4 || count === bufferCountdown) {
        hit = srcP - hit - 1
        putBit(1)
        putDictLD(count - 2)
        putDictLD((hit >> 8) + 2)
        dst[dstP] = hit & 0xFF
        dstP += 1
        bufferCountdown -= count
        srcP += count
        if (skiphits) {
          hashTable.set(srcPH)
          srcPH += count
        }
        continue
      }
    }
    putBit(0)
    dst[dstP] = src[srcP]
    srcP += 1
    dstP += 1
    bufferCountdown -= 1
  }

  while (bufferCountdown) {
    putBit(0)
    dst[dstP] = src[srcP]
    srcP += 1
    dstP += 1
    bufferCountdown -= 1
  }
  dstView.setUint16(dstPB, (block16DictBits << block16Countdown) & 0xFFFF, littleEndian)
  return dst.slice(0, dstP)
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

const encryptBytes = (bytes) => {
  return wordArrayToBytes(
    CryptoJS.DES.encrypt(
      bytesToWordArray(bytes),
      desKey,
      desOptions
    ).ciphertext
  )
}

const decryptBytes = (bytes) => {
  return wordArrayToBytes(
    CryptoJS.DES.decrypt(
      CryptoJS.lib.CipherParams.create({
        ciphertext: bytesToWordArray(bytes)
      }),
      desKey,
      desOptions
    )
  )
}

const ensureEqualConfigs = (a, b) => {
  if (a.xml !== b.xml) {
    throw new Error('Exported XML does not match editor.')
  }
  if (a.littleEndian !== b.littleEndian) {
    throw new Error('Exported endianness does not match editor.')
  }
}

export const encodeConfig = async (config) => {
  const encodedXML = encodeXML(config.xml)
  const compressed = compressBytes(encodedXML, config.littleEndian, false)
  const integrity = getMD5(compressed)

  const combinedSize = integrity.length + compressed.length
  const lengthPadding = combinedSize % 8 ? 8 - combinedSize % 8 : 0
  const plainSize = combinedSize + lengthPadding

  const plain = new Uint8Array(plainSize)
  plain.set(integrity)
  plain.set(compressed, integrity.length)

  const encrypted = encryptBytes(plain)

  const file = new File(
    [encrypted.buffer],
    "config.bin",
    { type: 'application/octet-stream' }
  )

  ensureEqualConfigs(config, await decodeConfig(file))

  return file
}

export const decodeConfig = async (file) => {
  if (file.size % 8 !== 0) {
    throw new Error(`Invalid config size. Must be multiple of 8. ${file.size}`)
  }

  const config = decryptBytes(new Uint8Array(await file.arrayBuffer()))
  const littleEndian = isLittleEndian(config)
  const configFormat = getConfigFormat(config)
  const encodedXML = configFormat.extractXML(config, littleEndian)
  const xml = decodeXML(encodedXML)
  return {
    format: configFormat.name,
    littleEndian,
    xml
  }
}
