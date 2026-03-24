/**
 * Sample records using systematic random sampling
 * @param records - Array of records to sample from
 * @param sampleSize - Number of records to sample
 * @returns Array of sampled records
 */
export function generateSystematicSample(records: any[], sampleSize: number): any[] {
  if (records.length <= sampleSize) {
    return records;
  }
  
  // Systematic sampling with random start
  const step = Math.floor(records.length / sampleSize);
  const start = Math.floor(Math.random() * step);
  
  const sampled = [];
  for (let i = start; i < records.length && sampled.length < sampleSize; i += step) {
    sampled.push(records[i]);
  }
  
  // If we didn't get enough samples, fill with random selection
  while (sampled.length < sampleSize) {
    const randomIndex = Math.floor(Math.random() * records.length);
    const randomRecord = records[randomIndex];
    if (!sampled.includes(randomRecord)) {
      sampled.push(randomRecord);
    }
  }
  
  return sampled;
}
