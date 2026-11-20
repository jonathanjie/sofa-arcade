// Mechanical image optimization only; illustrations are original imagegen outputs.
// Usage: node public/assets/odd-laws-society/sources/buildings/optimize.cjs /path/to/original-pngs
// Original generation outputs are intentionally excluded from the shipped repository.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../../../../..');
const sharp = createRequire(path.join(root, 'ui/media/odd-laws-society/package.json'))('sharp');
const assets = path.join(root, 'public/assets/odd-laws-society');
const sourceDirectory = process.argv[2];
if (!sourceDirectory) throw new Error('Pass the directory containing the original imagegen PNGs recorded in generation-log.json.');
const logPath = path.join(__dirname, 'generation-log.json');
const entries = JSON.parse(fs.readFileSync(logPath, 'utf8'));
const fragmentPath = path.join(root, 'ui/media/odd-laws-society/fragments/buildings.json');
const fragment = fs.existsSync(fragmentPath) ? JSON.parse(fs.readFileSync(fragmentPath)) : {};
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
(async () => {
  for (const entry of entries) {
    const input = fs.readFileSync(path.join(sourceDirectory, entry.sourceFile));
    if (hash(input) !== entry.sourceSha256) throw new Error(entry.id + ': source hash differs from recorded generation');
    const meta = await sharp(input).metadata();
    if (!meta.hasAlpha) throw new Error(entry.id + ': generated input missing alpha');
    const output = path.join(assets, 'buildings', entry.id + '.webp');
    // Preserve the complete generated canvas and add guaranteed transparent borders.
    await sharp(input).resize(464, 464, { fit: 'contain', background: '#00000000' })
      .extend({top:24,bottom:24,left:24,right:24,background:'#00000000'})
      .webp({quality:87,alphaQuality:100,effort:6}).toFile(output);
    const bytes = fs.readFileSync(output);
    entry.shippedSha256 = hash(bytes);
    entry.sourceDimensions = [meta.width, meta.height]; entry.shippedBytes = bytes.length;
    fragment[entry.id] = { src:'buildings/'+entry.id+'.webp', width:512, height:512,
      alt:entry.alt, status:'final', medium:'AI-generated watercolor illustration',
      anchor:{x:0.5,y:0.92}, transparent:true };
    console.log(entry.id, bytes.length);
  }
  fs.writeFileSync(fragmentPath, JSON.stringify(fragment,null,2)+'\n');
  fs.writeFileSync(logPath, JSON.stringify(entries,null,2)+'\n');
})().catch(error=>{console.error(error);process.exitCode=1;});
