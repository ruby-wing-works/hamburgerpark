// main.js - Hamburger Park core logic

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- 音響システム (Web Audio API) ---
class AudioManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);
        this.masterGain.gain.value = 0.5;
        this.muted = false;
    }

    toggleMute() {
        this.muted = !this.muted;
    }

    // 短いビープ音生成
    playTone(freq, type, duration, volume = 0.1) {
        if (this.muted) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = type; // 'sine', 'square', 'sawtooth', 'triangle'
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        g.gain.setValueAtTime(volume, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
        osc.connect(g);
        g.connect(this.masterGain);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    // 音楽エンジンの簡易版（ループ）
    playBGM(type) {
        // BGMの実装は複雑になりやすいため、今回はシンプルな一定の雰囲気音に留めるか
        // またはコードでシーケンスを作成します
    }

    // 各アクションのSE
    playShot() { this.playTone(600, 'triangle', 0.2, 0.2); }
    playBounce() { this.playTone(400, 'sine', 0.1, 0.1); }
    playMatch() { 
        this.playTone(800, 'triangle', 0.1, 0.2); 
        this.playTone(1200, 'triangle', 0.3, 0.1); 
    }
    playStageClear() {
        if (this.muted) return;
        const now = this.ctx.currentTime;
        [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => {
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            osc.frequency.setValueAtTime(f, now + i * 0.1);
            g.gain.setValueAtTime(0.1, now + i * 0.1);
            g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.1 + 0.5);
            osc.connect(g);
            g.connect(this.masterGain);
            osc.start(now + i * 0.1);
            osc.stop(now + i * 0.1 + 0.5);
        });
    }
}
const audio = new AudioManager();

// --- ポップアップ演出 (Score/Combo) ---
class PopupText {
    constructor(text, x, y, color = '#fff') {
        this.text = text;
        this.x = x;
        this.y = y;
        this.color = color;
        this.life = 1.0;
    }
    update(dt) {
        this.life -= dt;
        this.y -= 40 * dt;
    }
    draw() {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.color;
        ctx.font = 'bold 28px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowBlur = 4;
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.fillText(this.text, this.x, this.y);
        ctx.restore();
    }
}
let popups = [];

// Adjust canvas size to maintain 9:16 aspect ratio
let isResizing = false;
function resizeCanvas() {
    if (isResizing) return;
    isResizing = true;
    const maxHeight = window.innerHeight;
    const maxWidth = window.innerWidth;
    const height = Math.min(maxHeight, maxWidth * 16 / 9);
    const width = height * 9 / 16;
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        initBackground();
    }
    isResizing = false;
}
window.addEventListener('resize', resizeCanvas);

// Background cache to prevent flickering
const bgCanvas = document.createElement('canvas');
const bgCtx = bgCanvas.getContext('2d');

function initBackground() {
    bgCanvas.width = canvas.width;
    bgCanvas.height = canvas.height;
    
    // 木のテーブルのベース色 (少し明るくして視認性を上げる)
    bgCtx.fillStyle = '#a67c52';
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);

    // 木目模様の描画 (固定された乱数シード的に固定位置で描画)
    bgCtx.strokeStyle = '#8d6540';
    bgCtx.lineWidth = 2;
    for (let i = -50; i < bgCanvas.width + 50; i += 40) {
        bgCtx.beginPath();
        bgCtx.moveTo(i + Math.sin(i) * 10, 0);
        bgCtx.bezierCurveTo(i + 40, bgCanvas.height * 0.3, i - 40, bgCanvas.height * 0.6, i + 20, bgCanvas.height);
        bgCtx.stroke();
    }

    // テーブルの縁のシャドウ
    const grad = bgCtx.createRadialGradient(bgCanvas.width / 2, bgCanvas.height / 2, 0, bgCanvas.width / 2, bgCanvas.height / 2, bgCanvas.height);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.3)');
    bgCtx.fillStyle = grad;
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
}
initBackground();
resizeCanvas(); // Ensure everything is sized and background is initialized

// No image assets; using colored circles for ingredients

class Ingredient {
    constructor(type, x, y, isShooter = false, isStatic = true) {
        this.type = type; // 'hamburger' | 'potato' | 'drink'
        this.x = x;
        this.y = y;
        this.radius = 30; // adjust as needed
        this.vx = 0;
        this.vy = 0;
        this.isDragging = false;
        this.isShooter = isShooter; // 発射台の玉かどうか
        this.isStatic = isStatic; // 固定された玉（壁）かどうか
        this.snapComplete = isStatic; // 初期配置の壁は最初からスナップ完了扱い
        this.scale = isShooter ? 0 : 1; // 出現時の「ポンッ」アニメーション用スケール
        this.settleTimer = 0; // 衝突後の固定待機時間
        this.color = { 
            hamburger: '#ffcc33', 
            potato: '#e63946', 
            drink: '#a8dadc',
            apple_pie: '#f4a261',
            soft_cream: '#ffffff'
        }[type];
    }

    draw() {
        const r = this.radius * this.scale;
        ctx.save();
        ctx.translate(this.x, this.y);

        if (pendingRemoval.has(this)) {
            // No direct modification here, handled in update
        } else if (this.scale < 1) {
            this.scale += 0.1;
            if (this.scale > 1) this.scale = 1;
        }

        // 物理的な境界（丸いお皿）を描画
        // これにより、非円形の具材（パイ等）が並んだ時の視覚的な隙間を埋める
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        
        // 基本の影
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(0,0,0,0.3)';

        if (this.type === 'hamburger') {
            // バンズ（上）
            ctx.fillStyle = '#d4a373';
            ctx.beginPath();
            ctx.arc(0, -r * 0.2, r * 0.9, Math.PI, 0);
            ctx.fill();
            // パティ
            ctx.fillStyle = '#6d452a';
            ctx.fillRect(-r * 0.9, -r * 0.1, r * 1.8, r * 0.25);
            // チーズ/レタス
            ctx.fillStyle = '#ffcc00';
            ctx.fillRect(-r * 0.9, r * 0.15, r * 1.8, r * 0.1);
            // バンズ（下）
            ctx.fillStyle = '#d4a373';
            ctx.fillRect(-r * 0.9, r * 0.25, r * 1.8, r * 0.4);
        } else if (this.type === 'potato') {
            // 赤いボウル（ケース）
            ctx.fillStyle = '#e63946';
            ctx.beginPath();
            ctx.moveTo(-r * 0.8, r * 0.8);
            ctx.lineTo(r * 0.8, r * 0.8);
            ctx.lineTo(r * 0.9, -r * 0.3);
            ctx.lineTo(-r * 0.9, -r * 0.3);
            ctx.closePath();
            ctx.fill();
            // ポテト
            ctx.fillStyle = '#ffcc00';
            ctx.fillRect(-r * 0.6, -r * 0.8, r * 0.2, r * 0.8);
            ctx.fillRect(-r * 0.2, -r * 0.9, r * 0.2, r * 0.9);
            ctx.fillRect(r * 0.2, -r * 0.7, r * 0.2, r * 0.7);
            ctx.fillRect(r * 0.4, -r * 0.85, r * 0.2, r * 0.85);
        } else if (this.type === 'drink') {
            // カップ
            ctx.fillStyle = '#f1faee';
            ctx.beginPath();
            ctx.moveTo(-r * 0.7, r * 0.9);
            ctx.lineTo(r * 0.7, r * 0.9);
            ctx.lineTo(r * 0.85, -r * 0.7);
            ctx.lineTo(-r * 0.85, -r * 0.7);
            ctx.closePath();
            ctx.fill();
            // 蓋
            ctx.fillStyle = '#a8dadc';
            ctx.fillRect(-r * 0.9, -r * 0.8, r * 1.8, r * 0.2);
            // ストロー
            ctx.strokeStyle = '#e63946';
            ctx.lineWidth = r * 0.15;
            ctx.beginPath();
            ctx.moveTo(r * 0.2, -r * 0.8);
            ctx.lineTo(r * 0.4, -r * 1.2);
            ctx.stroke();
        } else if (this.type === 'apple_pie') {
            // ホットアップルパイ
            ctx.fillStyle = '#f4a261';
            ctx.beginPath();
            roundRect(ctx, -r * 0.9, -r * 0.5, r * 1.8, r * 1.0, r * 0.2);
            ctx.fill();
            // 格子模様 (rが極小の時の無限ループを防止)
            const step = Math.max(0.1, r * 0.4);
            ctx.strokeStyle = '#e76f51';
            ctx.lineWidth = 2;
            for(let i = -r * 0.6; i <= r * 0.6; i += step) {
                ctx.beginPath(); ctx.moveTo(i, -r * 0.4); ctx.lineTo(i, r * 0.4); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-r * 0.8, i); ctx.lineTo(r * 0.8, i); ctx.stroke();
            }
        } else if (this.type === 'soft_cream') {
            // ソフトクリーム
            // コーン
            ctx.fillStyle = '#e9c46a';
            ctx.beginPath();
            ctx.moveTo(-r * 0.5, 0);
            ctx.lineTo(r * 0.5, 0);
            ctx.lineTo(0, r * r * 0.04); // 下に尖らせる
            ctx.lineTo(0, r * 0.9);
            ctx.fill();
            // クリーム（渦巻き風に重ねる）
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(0, -r * 0.1, r * 0.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(0, -r * 0.45, r * 0.45, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(0, -r * 0.75, r * 0.3, 0, Math.PI * 2);
            ctx.fill();
        }

        // 発射台で待機中の玉は目立たせる
        if (this.isShooter) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#fff';
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(0, 0, r + 5, 0, Math.PI * 2);
            ctx.stroke();
        } else {
            // 静的オブジェクトにも白いアウトラインを薄く入れて視認性を確保
            ctx.strokeStyle = 'rgba(255,255,255,0.6)';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        
        ctx.restore();
    }

    update(dt) {
        // 消去演出（0.2秒かけてスケールを0にする）
        if (pendingRemoval.has(this)) {
            this.scale = Math.max(0, this.scale - (dt / 0.2));
            return; // 消去中は他の処理をしない
        }

        if (this.settleTimer > 0) {
            this.settleTimer -= dt;
            if (this.settleTimer <= 0) {
                this.snapComplete = true; // 完全停止フラグを立てる
                needsMatchCheck = true; // 待機が終わったタイミングでも念のため再チェック
            }
        }

        if (this.isStatic || this.isShooter) return; // 固定・発射待ちは動かさない

        this.vx *= 0.995;
        this.vy *= 0.995;

        // 【停止処理の改善】
        // 速度が一定以下になったら完全に停止させて静止オブジェクト化する
        const speed = Math.hypot(this.vx, this.vy);
        if (speed < 40) {
            this.vx = 0;
            this.vy = 0;
            this.isStatic = true;
            this.snapComplete = true; // 摩擦で止まった場合は即時確定
        }

        // 【CCD ＆ 衝突の即時化（Trigger）】
        // 移動量を細かく分割（ステップ）して1フレーム内のすり抜けを防ぐ
        let steps = Math.ceil(Math.hypot(this.vx * dt, this.vy * dt) / (this.radius / 2));
        if (steps > 10) steps = 10; // ステップ数に上限を設け、CPU負荷の暴走を防ぐ
        const stepDt = dt / (steps || 1);

        for (let s = 0; s < steps; s++) {
            this.x += this.vx * stepDt;
            this.y += this.vy * stepDt;

            let collisionOccurred = false;

            // 他のすべての静的オブジェクト（壁化された玉）とのTrigger判定
            for (const other of ingredients) {
                if (other === this || !other.isStatic) continue;

                const dx = other.x - this.x;
                const dy = other.y - this.y;
                const dist = Math.hypot(dx, dy);
                const minDist = this.radius + other.radius;

                // 重なった（当たった）瞬間に即時固定イベント
                if (dist < minDist) {
                    // スナップ座標の計算（相手の中心から、飛んできた方向へぴったり minDist 離れた位置）
                    // 完全に重なって dist === 0 の事故を防ぐ
                    const safeDist = dist === 0 ? 0.001 : dist;
                    const pushDx = (this.x - other.x) / safeDist;
                    const pushDy = (this.y - other.y) / safeDist;

                    this.x = other.x + pushDx * minDist;
                    this.y = other.y + pushDy * minDist;

                    // 物理演算の停止
                    this.vx = 0;
                    this.vy = 0;
                    this.isStatic = true;
                    this.snapComplete = false; 
                    this.settleTimer = 0.1;
                    
                    needsMatchCheck = true; // 静止したのでチェックを予約

                    collisionOccurred = true;
                    break; // この玉の処理は終了
                }
            }

            if (collisionOccurred) break;

            // 壁との衝突（壁は引き続き反射する）
            const bounceFactor = 0.9;
            let hitWall = false;

            if (this.x - this.radius < 0) {
                this.x = this.radius;
                this.vx = -this.vx * bounceFactor;
                hitWall = true;
            }
            if (this.x + this.radius > canvas.width) {
                this.x = canvas.width - this.radius;
                this.vx = -this.vx * bounceFactor;
                hitWall = true;
            }
            if (this.y - this.radius < 0) {
                // 上の壁（天井）に当たった場合も、そのまま反射するのではなく固定したい場合はここで処理する。
                // 今回は「天井も壁」として弾かせる。
                this.y = this.radius;
                this.vy = -this.vy * bounceFactor;
                hitWall = true;
            }
            if (this.y + this.radius > canvas.height) {
                this.y = canvas.height - this.radius;
                this.vy = -this.vy * bounceFactor;
                hitWall = true;
            }
            if (hitWall) {
                audio.playBounce();
                if (!this.isStatic) currentShotBounces++; // 跳ね返り回数をカウント
                break;
            }
        }
    }
}

let ingredients = [];

// ステート変数の宣言を上に移動
let lastTime = performance.now();
let aiming = null; // {ingredient, startX, startY}
let stageClearing = false;
let currentStage = 1;
let score = 0;
let combo = 0;
let shots = 0; // ショット（弾）の残り回数
let continuesLeft = 3; // 残りコンティニュー回数
let gameState = 'title'; // 'playing', 'gameover', 'stageclear', 'title'
let titleIngredients = []; // タイトル画面用の飾り具材
let matchOccurredThisTurn = true; // コンボ継続管理フラグ
let matchDelayTimer = 0; // マッチ成立からの待機時間
let spawnLockTimer = 0; // 盤面静止後、生成を0.5秒間遅延させるためのロック
let pendingRemoval = new Set(); // 消去待ちの具材
let needsMatchCheck = false; // マッチ判定が必要な時だけフラグを立てる
let currentShotBounces = 0; // 現在のショットでのバウンド数

function drawBackground() {
    ctx.drawImage(bgCanvas, 0, 0);
}

function spawnInitial() {
    // UIやステートの初期化
    gameState = 'playing';
    
    // ショット数の初期化: 最初だけ多めに
    if (currentStage === 1) {
        shots = 30;
    }
    // ステージクリアボーナスはこの関数を呼ぶ側(pointerdown)で加算する
    
    combo = 0;
    matchOccurredThisTurn = true;

    ingredients = [];
    pendingRemoval.clear();
    titleIngredients = []; // ゲーム開始時はタイトルの飾りを消す
    
    // 具材数の計算: ステージ1は2個固定、それ以降は徐々に増やす
    let count;
    if (currentStage === 1) {
        count = 2;
    } else {
        // ステージ2: 5個, ステージ3: 8個, ...
        count = 2 + (currentStage - 1) * 3;
    }
    
    // ステージ進行に応じて出現する具材の種類を増やす
    let types;
    if (currentStage < 3) {
        types = ['hamburger', 'potato'];
    } else if (currentStage < 5) {
        types = ['hamburger', 'potato', 'drink'];
    } else if (currentStage < 7) {
        types = ['hamburger', 'potato', 'drink', 'apple_pie'];
    } else {
        types = ['hamburger', 'potato', 'drink', 'apple_pie', 'soft_cream'];
    }
    
    const maxCount = Math.min(count, 35); // 上限35個

    // ステージ1は中央付近に2個確定で隣接配置するが、位置や角度にランダム性を持たせる
    if (currentStage === 1) {
        let forcedType = types[Math.floor(Math.random() * types.length)];
        
        // 中心から少しだけランダムにずらす
        const cx = canvas.width / 2 + (Math.random() * 60 - 30);
        const cy = canvas.height * 0.4 + (Math.random() * 60 - 30);
        
        // ランダムな角度で2つを配置
        const angle = Math.random() * Math.PI * 2;
        const dist = 30; // 半径分（30px）ずらして確実に密着・マッチ判定に入るようにする
        
        ingredients.push(new Ingredient(forcedType, cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, false, true));
        ingredients.push(new Ingredient(forcedType, cx - Math.cos(angle) * dist, cy - Math.sin(angle) * dist, false, true));
        
        spawnShooter();
        return;
    }

    // 初期ステージ（具材が少ないとき）は中央付近に固めて配置する
    const isEarlyStage = currentStage <= 3;
    const minY = isEarlyStage ? canvas.height * 0.25 : canvas.height * 0.1;
    const maxY = isEarlyStage ? canvas.height * 0.45 : canvas.height * 0.55;
    const centerMargin = isEarlyStage ? canvas.width * 0.25 : 40;
    const minX = centerMargin;
    const maxX = canvas.width - centerMargin;

    // 初期配置時に3マッチが最初から揃ってしまうのを防ぐチェック関数
    function wouldFormMatch3(x, y, type) {
        let matchCount = 1;
        const visited = new Set();
        const stack = [];
        const dummyRadius = 40; // 具材の基本半径として仮定
        
        for (const ing of ingredients) {
            if (ing.type === type) {
                const dist = Math.hypot(x - ing.x, y - ing.y);
                if (dist <= dummyRadius + ing.radius + 8) {
                    stack.push(ing);
                    visited.add(ing);
                    matchCount++;
                }
            }
        }
        
        while (stack.length > 0) {
            const current = stack.pop();
            for (const neighbor of ingredients) {
                if (neighbor.type === type && !visited.has(neighbor)) {
                    const dist = Math.hypot(current.x - neighbor.x, current.y - neighbor.y);
                    if (dist <= current.radius + neighbor.radius + 8) {
                        visited.add(neighbor);
                        stack.push(neighbor);
                        matchCount++;
                    }
                }
            }
        }
        return matchCount >= 3;
    }

    let placed = 0;
    let globalAttempts = 0;
    const MAX_GLOBAL_ATTEMPTS = 500;

    while (placed < maxCount && globalAttempts < MAX_GLOBAL_ATTEMPTS) {
        globalAttempts++;
        let x, y;
        let valid = false;

        x = Math.random() * (maxX - minX) + minX;
        y = Math.random() * (maxY - minY) + minY;

        for (let shiftIter = 0; shiftIter < 100; shiftIter++) {
            valid = true;
            for (const ing of ingredients) {
                const dx = x - ing.x;
                const dy = y - ing.y;
                const dist = Math.hypot(dx, dy);
                const minDist = 65; 

                if (dist < minDist) {
                    valid = false;
                    const safeDist = dist === 0 ? 0.001 : dist;
                    const pushForce = minDist - dist;
                    x += (dx / safeDist) * pushForce;
                    y += (dy / safeDist) * pushForce;
                }
            }
            x = Math.max(minX, Math.min(maxX, x));
            y = Math.max(minY, Math.min(maxY, y));
            if (valid) break;
        }

        if (!valid) continue;

        // 3マッチになってしまわない色を選ぶ
        let availableTypes = [...types].sort(() => Math.random() - 0.5);
        let selectedType = availableTypes[0];
        for (let t of availableTypes) {
            if (!wouldFormMatch3(x, y, t)) {
                selectedType = t;
                break;
            }
        }

        ingredients.push(new Ingredient(selectedType, x, y, false, true));
        placed++;
    }

    spawnShooter();
}

function spawnShooter() {
    // 盤面上の存在する色をスキャンしてリスト化する（多い具材ほど配列内に多く入り、選ばれやすくなる）
    const activeTypes = [];
    for (const ing of ingredients) {
        if (ing.isStatic && !ing.isShooter && !pendingRemoval.has(ing)) {
            activeTypes.push(ing.type);
        }
    }

    let types = activeTypes;
    // もし盤面が空の場合などのエラー防止
    if (types.length === 0) {
        types = ['hamburger', 'potato', 'drink'];
    }

    const launchX = canvas.width / 2;
    const launchY = canvas.height * 0.85;

    // 発射台付近に具材が溜まっている場合、少しだけ押し退けて「道」を作る
    for (const ing of ingredients) {
        if (!ing.isShooter && ing.isStatic) {
            const dx = ing.x - launchX;
            const dy = ing.y - launchY;
            const dist = Math.hypot(dx, dy);
            const safeRadius = 80; // 発射台周り80pxは空ける
            if (dist < safeRadius) {
                const angle = Math.atan2(dy, dx);
                ing.x = launchX + Math.cos(angle) * (safeRadius + 10);
                ing.y = launchY + Math.sin(angle) * (safeRadius + 10);
            }
        }
    }

    const type = types[Math.floor(Math.random() * types.length)];
    // 発射台（画面中央下部）に座標を完全に固定
    const x = launchX;
    const y = launchY;
    // 手玉は最初は静止（isStatic=true）だか発射時に動的になる
    ingredients.push(new Ingredient(type, x, y, true, false));
}

// 初期化時は具材を生成せず、タイトル画面から開始
// spawnInitial(); 

// 変数は上部で宣言済み

function gameLoop(now) {
    let dt = (now - lastTime) / 1000;
    if (dt > 0.1) dt = 0.1; // dtが大きすぎるとき（タブ復帰時など）の暴走を防止
    lastTime = now;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawBackground();

    if (gameState === 'playing') {
        // update & draw ingredients
        let isMoving = false;
        let hasShooter = false;

        for (const ing of ingredients) {
            ing.update(dt);
            ing.draw();

            // 動きがあるか判定（しきい値を設定し、ダラダラ動くのを防ぐ）
            if (Math.hypot(ing.vx, ing.vy) >= 40) {
                isMoving = true;
            }
            if (ing.isShooter) {
                hasShooter = true;
            }
        }

        // ポップアップの更新
        for (let i = popups.length - 1; i >= 0; i--) {
            popups[i].update(dt);
            popups[i].draw();
            if (popups[i].life <= 0) popups.splice(i, 1);
        }

        // UI 描画（高品質なフォントと色）
        ctx.shadowBlur = 4;
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px "Outfit", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`Score: ${score}`, 20, 50);
        ctx.fillText(`Stage: ${currentStage}`, 20, 85);
        ctx.shadowBlur = 0;

        // 自機の隣にフローティング「残り：X」UIを描画
        const activeShooter = ingredients.find(ing => ing.isShooter);
        if (activeShooter) {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 20px "Outfit", sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(`SHOTS: ${shots}`, activeShooter.x + 40, activeShooter.y - 10);
        }

        // コンボのUI表示
        const hasActiveMoving = ingredients.some(ing => !ing.isStatic || Math.hypot(ing.vx, ing.vy) >= 40);

        if (combo > 0) {
            ctx.fillStyle = '#ffcc00';
            ctx.font = 'bold 36px "Fredoka One", sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(`${combo} COMBO!`, canvas.width - 20, 100); // ミュートボタンと被らないよう下に移動
        }

        // ステージクリア（全消し）とゲームオーバー（弾切れ生成待ち）の厳格チェック
        // 【クリア判定の厳密化 & 生成ロック（Lock）】
        // 全ての玉が静止し、固定待機中(0.1s)の玉もなく、消去アニメーション中(0.5s)でもない完全な状態か
        const hasSettling = ingredients.some(ing => ing.settleTimer > 0);
        const isBoardClean = pendingRemoval.size === 0 && !hasActiveMoving && !hasSettling && matchDelayTimer <= 0;

        if (isBoardClean) {
            const remainingTargets = ingredients.filter(ing => ing.isStatic && !ing.isShooter).length;

            if (remainingTargets === 0) {
                gameState = 'stageclear';
                audio.playStageClear();
            } else {
                // --- ゲームオーバー（ショット数枯渇）チェック ---
                // 盤面に手玉がなく、生成もできない状態でショットが0なら確定
                if (shots <= 0 && !hasShooter) {
                    gameState = 'gameover';
                } else if (!hasShooter && shots > 0) {
                    // 【安定確認の徹底 & スキャンのタイミング】
                    // 完全に静止し、処理が終わってから初めて0.5秒のカウントダウン（生成禁止期間）を進める
                    if (spawnLockTimer > 0) {
                        spawnLockTimer -= dt;
                    } else {
                        if (!matchOccurredThisTurn) {
                            combo = 0; // マッチしなかった場合はコンボリセット
                        }
                        spawnShooter(); // 0.5秒経ったらスキャンして次弾を出す
                    }
                }
            }
        } else {
            // 盤面が少しでも動いている・消去中などの『未完全状態』なら、
            // 生成禁止タイマーを常に0.5秒にリセットする（リセットし続けることで待機を強制）
            spawnLockTimer = 0.5;
        }

        // クリア演出のテキスト描画 (旧ロジックは削除)
        // if (stageClearing) { ... }

        // draw aiming line if dragging
        if (aiming) {
            // 引っ張った距離（ベクトル）
            const dx = aiming.startX - aiming.currentX;
            const dy = aiming.startY - aiming.currentY;

            // 飛んでいく方向とパワーの計算
            const distance = Math.hypot(dx, dy);

            // パワー（引いた距離）に応じて線の太さを変える
            const maxLineWidth = 15;
            const minLineWidth = 3;
            const calculatedWidth = Math.min(Math.max(distance * 0.05, minLineWidth), maxLineWidth);

            const startX = aiming.ingredient.x;
            const startY = aiming.ingredient.y;

            // 矢印の長さを引いた距離に応じて少し制限する（見栄えのため）
            const drawLen = Math.min(distance * 1.5, 200);
            const angle = Math.atan2(dy, dx);

            const endX = startX + Math.cos(angle) * drawLen;
            const endY = startY + Math.sin(angle) * drawLen;

            // 矢印の線部分
            ctx.strokeStyle = '#ff9800';
            ctx.lineWidth = calculatedWidth;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();

            // 矢印の先端の三角形
            const headlen = Math.max(calculatedWidth * 2, 15);
            ctx.fillStyle = '#ff9800';
            ctx.beginPath();
            ctx.moveTo(endX, endY);
            ctx.lineTo(endX - headlen * Math.cos(angle - Math.PI / 6), endY - headlen * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(endX - headlen * Math.cos(angle + Math.PI / 6), endY - headlen * Math.sin(angle + Math.PI / 6));
            ctx.lineTo(endX, endY);
            ctx.fill();
        }

        // パフォーマンス最適化: 消去アニメーション中や静止状態では判定をスキップ
        if (pendingRemoval.size > 0) {
            matchDelayTimer -= dt;
            if (matchDelayTimer <= 0) {
                ingredients = ingredients.filter(ing => !pendingRemoval.has(ing));
                pendingRemoval.clear();
                matchDelayTimer = 0;
                needsMatchCheck = true; // 消去後に連鎖チェックを予約
            }
        } else if (needsMatchCheck) {
            detectMatch3(now, dt);
        }
    } else if (gameState === 'title') {
        // タイトル画面用の飾り具材の初期化
        if (titleIngredients.length === 0) {
            const types = ['hamburger', 'potato', 'drink', 'apple_pie', 'soft_cream'];
            for (let i = 0; i < 10; i++) {
                const x = Math.random() * (canvas.width - 60) + 30;
                const y = Math.random() * (canvas.height - 60) + 30;
                const ing = new Ingredient(types[i % types.length], x, y, false, false);
                ing.scale = 0.8;
                // 最初にはじけ飛ぶ速度を与える
                const angle = Math.random() * Math.PI * 2;
                const speed = 200 + Math.random() * 200;
                ing.vx = Math.cos(angle) * speed;
                ing.vy = Math.sin(angle) * speed;
                titleIngredients.push(ing);
            }
        }

        // 飾りの更新と描画（タイトル画面では物理挙動を簡略化してバウンドさせる）
        for (const ing of titleIngredients) {
            ing.x += ing.vx * dt;
            ing.y += ing.vy * dt;

            // 壁バウンド
            if (ing.x - ing.radius < 0 || ing.x + ing.radius > canvas.width) {
                ing.vx *= -1;
                ing.x = Math.max(ing.radius, Math.min(canvas.width - ing.radius, ing.x));
            }
            if (ing.y - ing.radius < 0 || ing.y + ing.radius > canvas.height) {
                ing.vy *= -1;
                ing.y = Math.max(ing.radius, Math.min(canvas.height - ing.radius, ing.y));
            }

            // 具材同士の簡易衝突（タイトル用：速度を落とさずにはじき返す）
            for(const other of titleIngredients) {
                if(ing === other) continue;
                const dx = other.x - ing.x;
                const dy = other.y - ing.y;
                const dist = Math.hypot(dx, dy);
                if(dist < ing.radius + other.radius) {
                    const angle = Math.atan2(dy, dx);
                    // 速度（スカラー）を維持して向きだけ変える
                    const speed1 = Math.hypot(ing.vx, ing.vy);
                    const speed2 = Math.hypot(other.vx, other.vy);
                    ing.vx = -Math.cos(angle) * speed1;
                    ing.vy = -Math.sin(angle) * speed1;
                    other.vx = Math.cos(angle) * speed2;
                    other.vy = Math.sin(angle) * speed2;
                    
                    // 重なり防止
                    const overlap = (ing.radius + other.radius) - dist;
                    ing.x -= Math.cos(angle) * overlap / 2;
                    ing.y -= Math.sin(angle) * overlap / 2;
                    other.x += Math.cos(angle) * overlap / 2;
                    other.y += Math.sin(angle) * overlap / 2;
                }
            }
            ing.draw();
        }

        // タイトル画面の描画
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // タイトルロゴを2行に分けて描画し、1文字ずつジャンプさせる
        const line1 = "HAMBURGER";
        const line2 = "PARK";
        const fullText = line1 + line2;
        ctx.font = 'bold 52px "Fredoka One", sans-serif'; // 文字サイズを調整
        
        const drawLine = (text, y, startIndex) => {
            const totalWidth = ctx.measureText(text).width;
            let startX = (canvas.width - totalWidth) / 2;
            for (let i = 0; i < text.length; i++) {
                const char = text[i];
                const charIdx = startIndex + i;
                
                // ジャンプロジック
                const speed = 150;
                const cycle = fullText.length * speed + 1000;
                const timeOffset = (now % cycle) - (charIdx * speed);
                let jumpY = 0;
                if (timeOffset > 0 && timeOffset < speed * 2) {
                    jumpY = -Math.sin(Math.PI * (timeOffset / (speed * 2))) * 30;
                }
                
                // 1. 強めのドロップシャドウ
                ctx.fillStyle = '#5d3a22';
                ctx.fillText(char, startX + 6, y + jumpY + 6);

                // 2. 太めの白縁（視認性アップ）
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 12;
                ctx.lineJoin = 'round';
                ctx.strokeText(char, startX, y + jumpY);

                // 3. メインの文字色（鮮やかなオレンジ・イエロー）
                ctx.fillStyle = '#ffcc00';
                ctx.fillText(char, startX, y + jumpY);
                
                startX += ctx.measureText(char).width;
            }
        };

        ctx.textAlign = 'left';
        ctx.shadowBlur = 0;
        drawLine(line1, canvas.height * 0.28, 0);
        drawLine(line2, canvas.height * 0.28 + 90, line1.length);

        // スタートボタン
        ctx.textAlign = 'center';
        const btnW = 280;
        const btnH = 80;
        const btnX = canvas.width / 2 - btnW / 2;
        const btnY = canvas.height * 0.65;

        // ボタンの立体感
        ctx.fillStyle = '#6d452a';
        roundRect(ctx, btnX, btnY + 8, btnW, btnH, 15);
        ctx.fill();

        ctx.fillStyle = '#fff';
        roundRect(ctx, btnX, btnY, btnW, btnH, 15);
        ctx.fill();

        ctx.fillStyle = '#5d3a22';
        ctx.font = 'bold 32px "Fredoka One", sans-serif';
        ctx.fillText('START GAME', canvas.width / 2, btnY + 52);
        
        ctx.shadowBlur = 0;
    } else if (gameState === 'gameover') {
        // 半透明の暗いオーバーレイ
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Game Over テキスト
        ctx.fillStyle = '#ff4444';
        ctx.font = 'bold 54px "Fredoka One", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Game Over', canvas.width / 2, canvas.height / 2 - 140);

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 32px "Outfit", sans-serif';
        ctx.fillText(`Score: ${score}`, canvas.width / 2, canvas.height / 2 - 80);

        const btnW = 260;
        const btnH = 60;

        // Retry ボタン（Restart Stage 1）
        ctx.fillStyle = '#fff';
        roundRect(ctx, canvas.width / 2 - btnW / 2, canvas.height / 2 - 30, btnW, btnH, 10);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.font = 'bold 24px "Outfit", sans-serif';
        ctx.fillText('Retry (Stage 1)', canvas.width / 2, canvas.height / 2 + 8);

        // Continue ボタン（残り回数制）
        const canContinue = continuesLeft > 0;
        ctx.fillStyle = canContinue ? '#ffcc00' : '#444';
        roundRect(ctx, canvas.width / 2 - btnW / 2, canvas.height / 2 + 50, btnW, btnH, 10);
        ctx.fill();
        ctx.fillStyle = canContinue ? '#000' : '#888';
        const heartStr = '❤️'.repeat(continuesLeft) || 'NONE';
        ctx.fillText(`Continue (${heartStr})`, canvas.width / 2, canvas.height / 2 + 88);

        // スコア2割減の警告メッセージ
        if (canContinue) {
            ctx.fillStyle = '#ff6666';
            ctx.font = 'bold 18px "Outfit", sans-serif';
            ctx.fillText('Penalty: Score -20%', canvas.width / 2, canvas.height / 2 + 135);
        }

        // Titleに戻るボタン (誤タップ防止で下部に離し、色を変える)
        ctx.strokeStyle = '#aaa';
        ctx.lineWidth = 2;
        roundRect(ctx, canvas.width / 2 - btnW / 2, canvas.height - 100, btnW, btnH - 10, 10);
        ctx.stroke();
        ctx.fillStyle = '#aaa';
        ctx.font = 'bold 20px "Outfit", sans-serif';
        ctx.fillText('Back to Title', canvas.width / 2, canvas.height - 63);
    } else if (gameState === 'stageclear') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#ffcc00';
        ctx.font = 'bold 54px "Fredoka One", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Stage Clear!', canvas.width / 2, canvas.height / 2 - 100);

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 32px "Outfit", sans-serif';
        ctx.fillText(`Score: ${score}`, canvas.width / 2, canvas.height / 2 - 20);
        ctx.fillText(`Combo: ${combo}`, canvas.width / 2, canvas.height / 2 + 20);

        const btnW = 260;
        const btnH = 60;
        const nextX = canvas.width / 2 - btnW / 2;
        const nextY = canvas.height / 2 + 80;

        ctx.fillStyle = '#fff';
        roundRect(ctx, nextX, nextY, btnW, btnH, 10);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.font = 'bold 24px "Outfit", sans-serif';
        ctx.fillText('Next Stage', canvas.width / 2, nextY + 38);
    }

    // ミュートボタンの描画
    if (gameState === 'title') {
        // タイトル画面用の目立つサウンド設定ボタン
        const soundBtnW = 220;
        const soundBtnH = 60;
        const soundBtnX = canvas.width / 2 - soundBtnW / 2;
        const soundBtnY = canvas.height * 0.65 + 100; // STARTボタンの下

        ctx.fillStyle = audio.muted ? '#aa4444' : '#44aa44';
        roundRect(ctx, soundBtnX, soundBtnY, soundBtnW, soundBtnH, 10);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(audio.muted ? '🔇 Sound OFF' : '🔊 Sound ON', canvas.width / 2, soundBtnY + 38);

        // クリック判定用に保存
        audio.titleBtnRect = { x: soundBtnX, y: soundBtnY, w: soundBtnW, h: soundBtnH };
    } else {
        // ゲーム中などは右上のコンパクトなボタン
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.beginPath();
        ctx.arc(canvas.width - 40, 40, 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = audio.muted ? '#ff4444' : '#fff';
        ctx.font = '24px sans-serif'; // 絵文字用フォント
        ctx.textAlign = 'center';
        ctx.fillText(audio.muted ? '🔇' : '🔊', canvas.width - 40, 48);
        
        audio.titleBtnRect = null;
    }

    requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);


function getPointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    let clientX = e.clientX;
    let clientY = e.clientY;
    
    // スマホのタッチイベント対応
    if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    }
    
    // CSS上のサイズとCanvas内部の解像度がずれた場合のための補正処理
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    
    return { x, y };
}

const handleInputDown = (e) => {
    // タッチイベント時のスクロールやダブルタップズームを防止
    if (e.type === 'touchstart') {
        e.preventDefault();
    }
    
    const { x, y } = getPointerPos(e);

    // ミュートボタンの判定
    let clickedMute = false;
    if (gameState === 'title' && audio.titleBtnRect) {
        const { x: bx, y: by, w: bw, h: bh } = audio.titleBtnRect;
        if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) {
            clickedMute = true;
        }
    } else {
        const muteDist = Math.hypot(x - (canvas.width - 40), y - 40);
        if (muteDist <= 30) { // 少し広めに判定
            clickedMute = true;
        }
    }

    if (clickedMute) {
        audio.toggleMute();
        if (!audio.muted && audio.ctx.state === 'suspended') {
            audio.ctx.resume();
        }
        return;
    }

    if (gameState === 'title') {
        const btnW = 280;
        const btnH = 80;
        const btnX = canvas.width / 2 - btnW / 2;
        const btnY = canvas.height * 0.65;

        if (x >= btnX && x <= btnX + btnW && y >= btnY && y <= btnY + btnH) {
            currentStage = 1;
            score = 0;
            shots = 30;
            continuesLeft = 3; // ゲーム開始時にリセット
            spawnInitial();
        }
        return;
    }

    if (gameState === 'stageclear') {
        const btnW = 260;
        const btnH = 60;
        const nextX = canvas.width / 2 - btnW / 2;
        const nextY = canvas.height / 2 + 80;

        if (x >= nextX && x <= nextX + btnW && y >= nextY && y <= nextY + btnH) {
            currentStage++;
            shots += 10; // クリアボーナス
            spawnInitial();
        }
        return;
    }

    if (gameState === 'gameover') {
        const btnW = 260;
        const btnH = 60;
        const tryX = canvas.width / 2 - btnW / 2;
        const tryY = canvas.height / 2 - 30;
        const contX = canvas.width / 2 - btnW / 2;
        const contY = canvas.height / 2 + 50;

        // リトライボタン判定（最初から）
        if (x >= tryX && x <= tryX + btnW && y >= tryY && y <= tryY + btnH) {
            score = 0; // スコアリセット
            currentStage = 1; // ステージも最初から
            spawnInitial();
            return;
        }

        // コンティニューボタン判定（残り回数制）
        if (continuesLeft > 0 && x >= contX && x <= contX + btnW && y >= contY && y <= contY + btnH) {
            continuesLeft--;
            shots += 10; // 10ショット回復
            score = Math.floor(score * 0.8); // スコア2割減
            gameState = 'playing';
            return;
        }

        // Titleに戻る判定
        const titleY = canvas.height - 100;
        if (x >= contX && x <= contX + btnW && y >= titleY && y <= titleY + btnH) {
            gameState = 'title';
            titleIngredients = []; // タイトルの飾りをリセット生成させる
            return;
        }
    }

    if (gameState !== 'playing') return;

    // 自機（プレイヤー玉）の判定
    const target = ingredients.find(ing =>
        ing.isShooter && Math.hypot(ing.x - x, ing.y - y) <= ing.radius + 10
    );
    if (target) {
        target.isDragging = true;
        aiming = { ingredient: target, startX: target.x, startY: target.y, currentX: x, currentY: y };
    }
};

canvas.addEventListener('pointerdown', handleInputDown);
canvas.addEventListener('touchstart', handleInputDown, { passive: false });

// キャンバス外に出ても操作が途切れないよう、window にリスナーを追加
const handleInputMove = (e) => {
    if (aiming) {
        // getPointerPosはcanvas基準の座標を取る。イベントがwindowから来ても
        // clientX/Yとcanvasのboundingrectの差分を取っていれば正常に計算できる
        const pos = getPointerPos(e);
        aiming.currentX = pos.x;
        aiming.currentY = pos.y;
    }
};
window.addEventListener('pointermove', handleInputMove);
window.addEventListener('touchmove', handleInputMove, { passive: false });

const handleInputUp = (e) => {
    if (aiming) {
        // 引いた方向（current - start）を計算
        const dragDx = aiming.currentX - aiming.startX;
        const dragDy = aiming.currentY - aiming.startY;
        const distance = Math.hypot(dragDx, dragDy);

        if (distance > 10) { // 極端なちょい触りはキャンセル扱い
            if (aiming.ingredient) {
                // 発射時に1発消費
                shots--;
                currentShotBounces = 0; // バウンド数リセット

                // モンスト同様、引いた方向と「真逆」に飛ばす (dragDx, dragDy のマイナス)
                // プレイヤーが下に引いた(dragDy > 0)なら、上に飛ばす(vy < 0)
                const invDx = -dragDx;
                const invDy = -dragDy;

                // 発射の基本速度の倍率
                const speedFactor = 15; // 大幅に引き上げて摩擦減衰前の最高速を出す
                const maxSpeed = 3500; // 壁抜けを防止するための最大速度リミット

                let vx = invDx * speedFactor;
                let vy = invDy * speedFactor;

                const currentSpeed = Math.hypot(vx, vy);
                if (currentSpeed > maxSpeed) {
                    vx = (vx / currentSpeed) * maxSpeed;
                    vy = (vy / currentSpeed) * maxSpeed;
                }

                aiming.ingredient.vx = vx;
                aiming.ingredient.vy = vy;
                // 飛んでいる間は isStatic = false。何かにぶつかったら true になる。
                aiming.ingredient.isShooter = false;
                aiming.ingredient.isStatic = false;

                audio.playShot();

                // ターン単位でのコンボ判定を発射時にリセットする
                matchOccurredThisTurn = false;
            }
        }

        aiming.ingredient.isDragging = false;
        aiming = null;
    }
};
window.addEventListener('pointerup', handleInputUp);
window.addEventListener('touchend', handleInputUp);

// （旧：handleCollisions は、各玉の update(dt) 内でのCCD+即時判定に統合したため削除されました。
// ※ 物理演算と衝突めり込みチェックが切り離されていたのが事故の原因だったため、
// 移動した瞬間にチェック（Trigger判定）する設計に一本化しました）


function detectMatch3(now, dt) {
    const newlyMatched = new Set();
    const visited = new Set();

    for (let i = 0; i < ingredients.length; i++) {
        const root = ingredients[i];
        if (visited.has(root) || pendingRemoval.has(root)) continue;

        // 発射前の手玉（Ghost状態）は、絶対に消去判定に巻き込まれない
        if (root.isShooter) continue;

        // 【修正】settleTimerのチェックを外すことで、当たった瞬間にマッチ判定に含める
        if (!root.isStatic) continue;

        const group = [];
        const stack = [root];
        visited.add(root);

        while (stack.length > 0) {
            const current = stack.pop();
            group.push(current);

            for (let j = 0; j < ingredients.length; j++) {
                const neighbor = ingredients[j];
                // 手玉や既に消去待ちのものは巻き込まない
                if (neighbor.isShooter || pendingRemoval.has(neighbor)) continue;
                // 固定待機直後、スナップ未完了の玉は巻き込まない
                if (neighbor.settleTimer > 0 || !neighbor.snapComplete) continue;

                if (!visited.has(neighbor) && neighbor.type === current.type) {
                    const dx = current.x - neighbor.x;
                    const dy = current.y - neighbor.y;
                    const dist = Math.hypot(dx, dy);
                    // 隣接（接触）しているかチェック。磁石効果があるため少し甘めに判定 (+8px許容)
                    if (dist <= current.radius + neighbor.radius + 8) {
                        visited.add(neighbor);
                        stack.push(neighbor);
                    }
                }
            }
        }

        // 3つ以上繋がっていたら、まずは「消去待ちリスト」に追加する
        if (group.length >= 3) {
            for (const ing of group) {
                newlyMatched.add(ing);
            }
        }
    }

    // 新たにマッチした玉があった場合、コンボとディレイタイマーを処理
    if (newlyMatched.size > 0) {
        for (const ing of newlyMatched) {
            pendingRemoval.add(ing);
            // ※ scale 縮小は ing.update() の中で自動的に行われます
        }

        // 消去する瞬間にコンボ加算
        combo++;
        matchOccurredThisTurn = true; // このターンでマッチが1回でも発生した
        audio.playMatch();

        // 回復：消した個数に応じてショット数を回復（例：3つで1回復、4つなら+1..）
        // 『無駄撃ちをすれば死ぬ、連鎖を狙えば生き残れる』
        const recoveredShots = Math.floor(newlyMatched.size / 3);
        shots += recoveredShots;

        // コンボのおまけ：コンボ数が3連鎖、5連鎖などに達したらボーナスショットを加算
        if (combo >= 3) {
            shots += 1; // 3連鎖以上ならさらに+1回復
        }

        matchDelayTimer = 0.5; // 消去アニメーション用の待機時間

        // コンボによるスコア加算
        const baseScore = newlyMatched.size * 100;
        const multiplier = Math.pow(2, combo - 1);
        const bounceScore = currentShotBounces * 50;
        const finalAddedScore = baseScore * multiplier + bounceScore;
        score += finalAddedScore;
        
        // ポップアップ表示
        const first = Array.from(newlyMatched)[0];
        if (first) {
            let popupText = `+${finalAddedScore}`;
            if (currentShotBounces > 0) {
                popupText += ` (Bounce! +${bounceScore})`;
            }
            popups.push(new PopupText(popupText, first.x, first.y - 20, '#fff'));
            
            if (combo > 1) {
                popups.push(new PopupText(`${combo} COMBO!`, first.x, first.y + 20, '#ffcc00'));
            }
        }
        
        needsMatchCheck = true; // 次のフレームで連鎖をチェック
    } else {
        needsMatchCheck = false; // 何もなければチェック終了
    }
}

// 便利な角丸長方形描画
function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

// デバッグ用：タイトル画面で'5'キーを押すとステージ5から開始
window.addEventListener('keydown', (e) => {
    if (gameState === 'title' && e.key === '5') {
        currentStage = 5;
        shots = 10; // ステージ5相当の初期弾数
        score = 0;
        spawnInitial();
        gameState = 'playing';
    }
});
