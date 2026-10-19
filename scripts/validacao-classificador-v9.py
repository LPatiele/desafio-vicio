"""Confere os artefatos da rodada encerrada, sem API ou alteração de resultados."""
import json,hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[1];out=root/'output/comparisons/rag-classificador-v9'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(name):return json.loads((out/name).read_text())
r=read('resultados.json');files=sorted([p for p in (root/'src').rglob('*') if p.is_file()]+[root/'package-lock.json'])
code=hashlib.sha256('\n'.join(f'{p.relative_to(root)}:{sha(p)}' for p in files).encode()).hexdigest()
reference=sha(root/'referencias/analise-propria-v2/referencia.jsonl')
arch=read('codigo/hashes.json'); citations=read('conferencia-juridica.json');mentions=read('mencoes-normativas.json');compare=read('comparacao-cli.json')
checks=dict(allRunChecksPassed=all(all(c['checks'].values()) for c in r['reports']),allExperimentalControlsPassed=all(r['controls'].values()),currentCodeMatchesBothManifests=all(c['codeHash']==code for c in r['reports']),archivedSourceUnchanged=all(sha(out/'codigo'/p)==h and sha(root/p)==h for p,h in arch.items()),referenceV2Unchanged=reference=='7b69291c6a26c387a6f5606ee7b7032f2c383b8073afdab0e487ea6cac0951e8',noActiveRuns=all(not (root/'output/experiments'/c['name']/'run.lock').exists() for c in r['reports']),allSourceIdUsesReviewed=citations['pendentes']==0,allDetectedNormativeMentionsReviewed=mentions['pendentes']==0,allCitedIdsDelivered=all(c.get('entregue',{}).get('id')==c['sourceId'] for c in citations['citacoes']),recordsUnchanged=all(sha(root/'output/experiments'/c['name']/'records.json')==c['recordsHash'] for c in r['reports']),cliMatchesReport=compare['left']==r['reports'][0]['overall'] and compare['right']==r['reports'][1]['overall'])
assert all(checks.values()),checks
proof=dict(checks=checks,sourceHash=code,referenceHash=reference,tests=dict(count=72,log='testes.txt',sha256=sha(out/'testes.txt'),note='Testes e typecheck aprovados antes das execuções; código congelado permaneceu idêntico.'),conditions=[dict(name=c['name'],checks=c['checks'],fingerprint=c['fingerprint'],recordsHash=c['recordsHash'],knowledgeIdentity=c['knowledgeIdentity'],promptHashes=c['promptHashes']) for c in r['reports']],analysisInputsHashes={name:sha(out/name) for name in ['resultados.json','conferencia-notas.json','conferencia-mencoes-notas.json','citacoes-juiz.json','mencoes-normativas.json','comparacao-cli.json']})
(out/'validacao-tecnica.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(checks,ensure_ascii=False))
