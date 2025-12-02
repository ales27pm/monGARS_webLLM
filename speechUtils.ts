export async function blobToFloat32AudioData(
  blob: Blob,
  audioContext: AudioContext,
) {
  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  return {
    audioData: audioBuffer.getChannelData(0),
    sampleRate: audioBuffer.sampleRate,
  };
}
