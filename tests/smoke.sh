#!/usr/bin/env bash
# Uji alur utama lewat curl. Jalankan setelah server PHP & database aktif:
#   BASE=http://localhost:8000 bash tests/smoke.sh
# Catatan: skrip ini MEMBUAT dan MENYELESAIKAN satu pesanan. Muat ulang SQL untuk mereset data.
BASE="${BASE:-http://localhost:8000}"
J='Content-Type: application/json'
C=$(mktemp); A=$(mktemp)
say() { printf '\n\n== %s\n' "$1"; }

say "health";                      curl -s "$BASE/api/health"
say "katalog (Oli, 3 item)";       curl -s "$BASE/api/products?jenis=Oli&per_page=3"
say "tanpa login -> 401";          curl -s "$BASE/api/orders"
say "login pelanggan (budi)";      curl -s -c "$C" -H "$J" -d '{"username":"budi","password":"client123"}' "$BASE/api/auth/login"
say "pelanggan ke admin -> 403";   curl -s -b "$C" "$BASE/api/admin/dashboard"
say "pesan 2x OLI-001 (menahan stok)"
ORDER=$(curl -s -b "$C" -H "$J" -d '{"items":[{"product_id":1,"jumlah":2}]}' "$BASE/api/orders")
echo "$ORDER"
ID=$(echo "$ORDER" | sed -n 's/.*"transaction_id":\([0-9]*\).*/\1/p' | head -1)
say "pesan barang habis (OLI-006) -> 422"
curl -s -b "$C" -H "$J" -d '{"items":[{"product_id":6,"jumlah":1}]}' "$BASE/api/orders"

say "login admin";                 curl -s -c "$A" -H "$J" -d '{"username":"admin","password":"admin123"}' "$BASE/api/auth/login"
say "stok OLI-001 (tertahan naik, stok fisik tetap)"
curl -s -b "$A" "$BASE/api/admin/products/1"
say "pesanan yang menahan stok";   curl -s -b "$A" "$BASE/api/admin/reports/holds"
say "bayar tunai -> COMPLETED (stok fisik berkurang)"
curl -s -b "$A" -X PATCH -H "$J" -d '{"status":"COMPLETED","metode_bayar":"TUNAI"}' "$BASE/api/admin/transactions/$ID/status"
say "kartu stok OLI-001";          curl -s -b "$A" "$BASE/api/admin/reports/kartu-stok?product_id=1&limit=3"
say "audit stok (harus kosong)";   curl -s -b "$A" "$BASE/api/admin/reports/audit-stok"
say "dashboard";                   curl -s -b "$A" "$BASE/api/admin/dashboard"
echo; rm -f "$C" "$A"
