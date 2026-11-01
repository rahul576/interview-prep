// Which CSV questions are already covered by an existing bank question (skipped), and where the rest go.
import { readFileSync } from 'node:fs';
export const COVERED = {
  2:'java-002',5:'java-001',7:'java-105',9:'java-006',10:'java-006',16:'java-003',17:'java-228',19:'java-102',20:'java-229',21:'java-004',22:'java-208',24:'java-101',28:'java-208',29:'java-104',30:'java-104',34:'jb-027',
  39:'java-008',40:'java-009',41:'java-213',43:'java-009',44:'java-009',45:'java-009',46:'java-009',47:'java-009',48:'java-111',49:'java-213',50:'java-109',51:'java-110',52:'java-110',53:'java-218',54:'java-110',55:'java-010',56:'java-010',60:'java-216',
  63:'java-011',66:'java-121',68:'java-012',71:'java-121',72:'java-236',73:'java-013',75:'java-013',76:'java-222',77:'java-238',80:'java-014',81:'java-007',82:'java-241',88:'java-007',89:'java-240',90:'java-126',
  94:'java-219',99:'java-015',100:'java-015',101:'java-171',102:'java-017',104:'java-220',105:'java-016',108:'java-016',109:'java-018',110:'java-018',111:'java-107',112:'java-107',114:'java-116',117:'java-019',
  119:'java-118',120:'java-118',121:'java-119',123:'java-020',124:'java-020',126:'java-021',128:'java-022',129:'java-232',130:'java-022',134:'jb-018',135:'java-229',
  136:'java-161',138:'java-403',142:'java-033',143:'java-404',147:'java-160',148:'java-034',149:'java-034',152:'java-317',153:'java-162',156:'java-406',
  159:'java-023',160:'java-023',163:'java-024',164:'java-026',165:'java-124',166:'java-302',167:'java-023',169:'java-025',172:'java-125',174:'java-304',176:'java-306',179:'java-027',181:'java-126',182:'java-310',
  187:'java-029',189:'java-314',190:'java-028',191:'java-028',193:'java-131',194:'java-131',195:'java-132',
  200:'java-030',201:'java-321',202:'java-030',204:'java-323',205:'java-170',206:'java-126',209:'java-426',210:'java-136',211:'java-043',
  216:'java-411',217:'java-411',220:'java-137',221:'java-137',223:'java-038',225:'java-427',229:'java-037',230:'java-415',231:'java-139',233:'java-037',236:'java-044',237:'java-430',
  238:'kafka-001',239:'kafka-001',240:'kafka-002',241:'kafka-001',242:'java-039',244:'kafka-007',245:'kafka-008',246:'java-039',247:'java-417',248:'kafka-003',253:'kafka-015',254:'kafka-003',257:'kafka-005',
  264:'java-040',266:'java-140',267:'java-140',268:'java-032',271:'java-141',276:'java-145',277:'java-173',278:'java-173',279:'java-173',280:'java-143',281:'java-146',282:'java-431',283:'java-138',284:'java-138',285:'java-149',287:'java-168',
  291:'java-130',294:'java-120',295:'java-428',300:'java-151',
};
export function rows() {
  const csv = readFileSync(new URL('./java_backend_300.csv', import.meta.url), 'utf8').replace(/^﻿/, '').replace(/\r/g, '');
  const re = /^(\d+),(\w+),([^,]+),(?:"((?:[^"]|"")*)"|(.*))$/;
  return csv.split('\n').slice(1).map(l => l.match(re)).filter(Boolean).map(m => ({ n: +m[1], diff: m[2], area: m[3], q: (m[4] ?? m[5]).replace(/""/g, '"') }));
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const r = rows(); const keep = r.filter(x => !COVERED[x.n]);
  console.log('total', r.length, 'covered', r.length - keep.length, 'new', keep.length);
  for (const x of keep) console.log(x.n, x.diff[0], x.area, '|', x.q);
}
