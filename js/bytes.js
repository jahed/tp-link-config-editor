export const bytesToDataView = (bytes) => {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

export const bytesToWordArray = (bytes) => {
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

export const wordArrayToBytes = (wordArray) => {
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

export const bytesToText = (bytes) => {
  return new TextDecoder().decode(bytes)
}

export const textToBytes = (text) => {
  return new TextEncoder().encode(text)
}

export const equalArrays = (a, b) => {
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

export const getMD5 = (bytes) => {
  return wordArrayToBytes(CryptoJS.MD5(bytesToWordArray(bytes)))
}

export const boolToBit = (bool) => {
  return bool ? 1 : 0
}
