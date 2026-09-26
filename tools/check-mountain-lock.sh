#!/usr/bin/env bash
# 山锁 CI: 锁母卷字节 + 关键常量
# 用法: ./tools/check-mountain-lock.sh
# 在干净 clone 里运行; 任一项失败打印(项/期望/实际)并退出非 0
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MANIFEST="$ROOT/tools/mountain-lock.json"
FAIL=0

jget() { python3 -c "import json; print(json.load(open('$MANIFEST'))['$1'])"; }
jget_list() { python3 -c "import json; v=json.load(open('$MANIFEST'))['$1']; print(v[0], v[1])"; }

PANORAMA_PATH="$ROOT/$(jget panoramaPath)"
PANORAMA_NAME="$(jget panorama)"
EXPECT_MD5="$(jget md5)"
EXPECT_Q="$(jget cacheQuery)"
Q_PATH="$ROOT/$(jget cacheQueryPath)"
WK_PATH="$ROOT/$(jget worldKPath)"
EXPECT_WK="$(jget worldK)"
FUSED_PATH="$ROOT/$(jget fusedBlocksPath)"
TOWER_PATH="$ROOT/$(jget towerSeatPath)"
read -r EXPECT_TX EXPECT_TY <<< "$(jget_list towerSeat)"

fail() { echo "FAIL  $1 | 期望: $2 | 实际: $3"; FAIL=1; }
pass() { echo "OK    $1"; }

# 1) 母卷 MD5
if [ ! -f "$PANORAMA_PATH" ]; then
  fail "panorama存在" "$PANORAMA_PATH" "文件缺失"
else
  if command -v md5sum >/dev/null 2>&1; then
    ACT_MD5="$(md5sum "$PANORAMA_PATH" | awk '{print $1}')"
  else
    ACT_MD5="$(md5 -q "$PANORAMA_PATH")"
  fi
  [ "$ACT_MD5" = "$EXPECT_MD5" ] && pass "panorama MD5" || fail "panorama MD5" "$EXPECT_MD5" "$ACT_MD5"
fi

# 2) WORLD_K == 4.4 (允许 4.4 / 4.40)
WK_RAW="$(grep -oE 'WORLD_K[[:space:]]*=[[:space:]]*[0-9.]+' "$WK_PATH" | head -1 | grep -oE '[0-9.]+$' || true)"
if [ "$WK_RAW" = "4.4" ] || [ "$WK_RAW" = "4.40" ]; then
  pass "WORLD_K=$WK_RAW"
else
  fail "WORLD_K" "$EXPECT_WK (允许 4.4/4.40)" "${WK_RAW:-未找到}"
fi

# 3) FUSED_BLOCKS 为空 (字面 [] 初始化)
FUSED_LINE="$(grep -n 'FUSED_BLOCKS' "$FUSED_PATH" | grep '=' | head -1 || true)"
if echo "$FUSED_LINE" | grep -qE '=[[:space:]]*\[[[:space:]]*\]'; then
  pass "FUSED_BLOCKS为空"
else
  if grep -A5 'FUSED_BLOCKS[^=]*=' "$FUSED_PATH" | grep -q 'id:'; then
    fail "FUSED_BLOCKS为空" "[] (无融合块)" "含融合块条目"
  else
    fail "FUSED_BLOCKS为空" "[] 字面初始化" "未识别: ${FUSED_LINE:-未找到}"
  fi
fi

# 4) 缓存 query == v=8, 且无旧 v=5/6/7 指向同一文件名
Q_HITS="$(grep -oE "${PANORAMA_NAME//./\\.}\\?v=[0-9]+" "$Q_PATH" | sort -u || true)"
if [ -z "$Q_HITS" ]; then
  fail "cacheQuery" "$EXPECT_Q" "源码中未找到 ${PANORAMA_NAME}?v="
else
  BAD_Q="$(echo "$Q_HITS" | grep -vE "\\?${EXPECT_Q}\$" || true)"
  if [ -n "$BAD_Q" ]; then
    fail "cacheQuery无旧版本" "仅 ?${EXPECT_Q}" "$Q_HITS"
  elif echo "$Q_HITS" | grep -qE "\\?${EXPECT_Q}\$"; then
    pass "cacheQuery=?${EXPECT_Q}"
  else
    fail "cacheQuery" "?${EXPECT_Q}" "$Q_HITS"
  fi
fi

# 5) 塔座位 0.859 / 0.168
TOWER_LINE="$(grep -E 'id:[[:space:]]*"tower"' "$TOWER_PATH" | head -1 || true)"
ACT_TX="$(echo "$TOWER_LINE" | grep -oE 'nx:[[:space:]]*[0-9.]+' | grep -oE '[0-9.]+$' || true)"
ACT_TY="$(echo "$TOWER_LINE" | grep -oE 'ny:[[:space:]]*[0-9.]+' | grep -oE '[0-9.]+$' || true)"
if [ "$ACT_TX" = "$EXPECT_TX" ] && [ "$ACT_TY" = "$EXPECT_TY" ]; then
  pass "塔座位=($ACT_TX,$ACT_TY)"
else
  fail "塔座位" "($EXPECT_TX,$EXPECT_TY)" "(${ACT_TX:-?},${ACT_TY:-?})"
fi

[ "$FAIL" -eq 0 ] && echo "山锁: 全绿" || { echo "山锁: 有失败"; exit 1; }
