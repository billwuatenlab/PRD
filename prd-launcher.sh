#!/bin/bash
# PRD — Project Launcher
# Created: 2026-04-22

PROJECT_NAME="PRD"
PROJECT_DIR="/Users/billwu/Desktop/AI agent/Claude code/System/Projects/PRD"
HISTORY_FILE="$PROJECT_DIR/prd-history.txt"
MODEL="opus"
FRONTEND_PORT=56001
BACKEND_PORT=58001
WEB_URL="http://localhost:${FRONTEND_PORT}/products"
LOG_DIR="$PROJECT_DIR/.dev-logs"

# 隨機激勵話語 / Random encouraging messages
MESSAGES=(
    "每一份 PRD，都是讓想法變成現實的地圖。加油！ / Every PRD is a map that turns ideas into reality. Go for it!"
    "清晰的需求，是偉大產品的起點。 / Clear requirements are the starting point of great products."
    "今天也是充滿可能的一天，繼續創造屬於你的成果！ / Today is full of possibilities — keep building what's yours!"
    "你的堅持，就是最強的競爭力。 / Your persistence is your greatest strength."
    "困難只是還沒解決的問題，你一定能搞定！ / Challenges are just unsolved problems — you've got this!"
    "每個偉大的產品，都從一份好的 PRD 開始。 / Every great product starts with a great PRD."
    "專注當下，成果自然會來。 / Stay focused on the now, results will follow."
)
RAND_IDX=$((RANDOM % ${#MESSAGES[@]}))
ENCOURAGEMENT="${MESSAGES[$RAND_IDX]}"

# 記錄會話開始時間 / Log session start time
echo "---" >> "$HISTORY_FILE"
echo "$(date +%Y-%m-%d\ %H:%M:%S) | Session started" >> "$HISTORY_FILE"

# 設定終端標題 / Set terminal title
echo -ne "\033]0;🟡 $PROJECT_NAME\007"

# 顯示歡迎訊息 / Display welcome message
clear
echo "🟡 ====================================== 🟡"
echo "           PRD 專案 / Project"
echo "🟡 ====================================== 🟡"
echo ""
echo "  專案目錄 / Directory : $PROJECT_DIR"
echo "  模型 / Model         : claude-opus-4-6"
echo ""
echo "──────────────────────────────────────────"
echo "💪 $ENCOURAGEMENT"
echo "──────────────────────────────────────────"
echo ""
echo "📡 天線新聞將由 Claude 啟動時搜尋。"
echo "   Antenna news will be fetched by Claude on startup."
echo ""

# 進入專案目錄 / Change to project directory
cd "$PROJECT_DIR"

# ── 啟動 dev 伺服器 / Start dev servers ──────────────────
mkdir -p "$LOG_DIR"

start_server_if_needed() {
    local name="$1"
    local port="$2"
    local dir="$3"
    if lsof -i ":$port" -sTCP:LISTEN >/dev/null 2>&1; then
        echo "  ✓ $name 已在 port $port 執行 / already running on $port"
    else
        echo "  ▶ 啟動 $name (port $port)... / starting $name on $port..."
        ( cd "$dir" && nohup npm run dev > "$LOG_DIR/$name.log" 2>&1 & )
    fi
}

start_server_if_needed "backend"  "$BACKEND_PORT"  "$PROJECT_DIR/app/server"
start_server_if_needed "frontend" "$FRONTEND_PORT" "$PROJECT_DIR/app/client"

# 等前端 port 起來再開瀏覽器 / Wait for frontend port before opening browser
echo -n "  ⏳ 等待前端 / waiting for frontend"
for i in {1..30}; do
    if lsof -i ":$FRONTEND_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
        echo ""
        echo "  ✓ 開啟瀏覽器 / opening browser → $WEB_URL"
        open "$WEB_URL"
        break
    fi
    echo -n "."
    sleep 1
done
echo ""

# 記錄會話結束時間（exit 前）/ Log session end on exit
trap 'echo "$(date +%Y-%m-%d\ %H:%M:%S) | Session ended" >> "$HISTORY_FILE"' EXIT

# 直接啟動 Claude Code / Launch Claude Code directly
exec claude --model $MODEL
