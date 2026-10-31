#!/usr/bin/env python3
# restore.py snapshot|revert  — put back what the archive scenario archived (local bench DB only).
# DB path from PERF_DB (default: $PERF_WORK/bench.db); snapshot lives next to it.
import os, sqlite3, sys, json
WORK = os.environ.get('PERF_WORK', '/tmp/td-perf-library')
DB = os.environ.get('PERF_DB', os.path.join(WORK, 'bench.db'))
SNAP = os.path.join(WORK, 'archived.snapshot.json')
c=sqlite3.connect(DB)
if sys.argv[1]=='snapshot':
    json.dump([r[0] for r in c.execute("select id from places where status='archived'")], open(SNAP,'w'))
else:
    keep=set(json.load(open(SNAP)))
    ids=[r[0] for r in c.execute("select id from places where status='archived'") if r[0] not in keep]
    for i in ids: c.execute("update places set status='library', archived_at=NULL where id=?", (i,))
    c.commit(); print('restored', len(ids))
