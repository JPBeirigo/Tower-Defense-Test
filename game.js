const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const GRID_SIZE = 50;
const PATH_Y = 225;
const PATH_HEIGHT = 50;
const MAX_WAVES = 20;

let towers = [], enemies = [], projectiles = [];
let money = 150, kills = 0, health = 100, wave = 1;
let waveActive = false, selectedTowerType = "cannon";
let previewX = null, previewY = null;
let hoverX = null, hoverY = null;
let selectedTower = null; // for upgrades

const towerStats = {
    cannon: { cost: 30, range: 160, fireRate: 50, damage: 20, color: "#2e8b57", label: "Cannon" },
    sniper: { cost: 50, range: 260, fireRate: 90, damage: 55, color: "#6a0dad", label: "Sniper" },
    rapid:  { cost: 40, range: 120, fireRate: 15, damage: 10, color: "#ff8c00", label: "Rapid" },
    freeze: { cost: 45, range: 140, fireRate: 55, damage: 0,  color: "#00c8ff", label: "Freeze" }
};

const UPGRADE_COSTS = [50, 100]; // cost to go from level 1→2, 2→3

function getUpgradedStats(type, level) {
    const base = towerStats[type];
    const mult = 1 + (level - 1) * 0.3;
    return {
        range:    Math.round(base.range * mult),
        fireRate: Math.max(5, Math.round(base.fireRate / mult)),
        damage:   Math.round(base.damage * mult)
    };
}

class Tower {
    constructor(x, y, type) {
        this.x = x; this.y = y; this.type = type;
        this.color = towerStats[type].color;
        this.level = 1;
        this.cooldown = 0; this.angle = 0;
        this._applyStats();
    }

    _applyStats() {
        const s = getUpgradedStats(this.type, this.level);
        this.range = s.range;
        this.fireRate = s.fireRate;
        this.damage = s.damage;
    }

    upgrade() {
        if (this.level >= 3) return false;
        const cost = UPGRADE_COSTS[this.level - 1];
        if (money < cost) return false;
        money -= cost;
        this.level++;
        this._applyStats();
        return true;
    }

    update() {
        if (this.cooldown > 0) this.cooldown--;
        let target = null, maxX = -1;

        enemies.forEach(e => {
            if (e.dead) return;
            let dx = e.x - this.x, dy = e.y - this.y;
            let dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= this.range && e.x > maxX) {
                maxX = e.x; target = e;
            }
        });

        if (target) {
            let dx = target.x - this.x, dy = target.y - this.y;
            this.angle = Math.atan2(dy, dx);
            if (this.cooldown <= 0) {
                projectiles.push(new Projectile(this.x, this.y, target, this.damage, this.type));
                this.cooldown = this.fireRate;
            }
        }
    }

    draw() {
        const isSelected = selectedTower === this;

        // Selection glow
        if (isSelected) {
            ctx.shadowColor = "white";
            ctx.shadowBlur = 16;
        }

        // Base
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x - 20, this.y - 20, 40, 40);

        ctx.shadowBlur = 0;

        // Level pips
        for (let i = 0; i < this.level; i++) {
            ctx.fillStyle = "gold";
            ctx.beginPath();
            ctx.arc(this.x - 12 + i * 12, this.y + 14, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        if (this.type === "freeze") {
            // Draw snowflake arms instead of barrel
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.strokeStyle = "white";
            ctx.lineWidth = 2;
            for (let i = 0; i < 6; i++) {
                ctx.save();
                ctx.rotate((i * Math.PI) / 3);
                ctx.beginPath();
                ctx.moveTo(0, 0); ctx.lineTo(0, -16);
                ctx.moveTo(-5, -10); ctx.lineTo(0, -16); ctx.lineTo(5, -10);
                ctx.stroke();
                ctx.restore();
            }
            ctx.restore();
        } else {
            // Barrel
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.angle);
            ctx.fillStyle = "black";
            ctx.fillRect(0, -4, 30, 8);
            ctx.restore();
        }

        // Range ring when selected
        if (isSelected) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.range, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(255,255,255,0.35)";
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.lineWidth = 1;
        }
    }
}

class Projectile {
    constructor(x, y, target, damage, type) {
        this.x = x; this.y = y;
        this.target = target;
        this.damage = damage;
        this.type = type;
        this.speed = 6;
        this.active = true;
        this.color = towerStats[type].color;
    }

    update() {
        if (!this.target || this.target.dead) { this.active = false; return; }
        let dx = this.target.x - this.x, dy = this.target.y - this.y;
        let d = Math.sqrt(dx * dx + dy * dy);

        if (d < 6) {
            if (this.type === "cannon") {
                let splashRadius = 60;
                enemies.forEach(e => {
                    let ex = e.x - this.target.x, ey = e.y - this.target.y;
                    if (Math.sqrt(ex * ex + ey * ey) < splashRadius) {
                        e.health -= this.damage;
                        if (e.health <= 0 && !e.dead) killEnemy(e);
                    }
                });
            } else if (this.type === "freeze") {
                this.target.frozen = 150;   // freeze for 150 frames
                this.target.frozenVisual = 150;
            } else {
                this.target.health -= this.damage;
                if (this.target.health <= 0 && !this.target.dead) killEnemy(this.target);
            }
            this.active = false;
            return;
        }

        this.x += (dx / d) * this.speed;
        this.y += (dy / d) * this.speed;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        const size = this.type === "freeze" ? 7 : 6;
        ctx.arc(this.x, this.y, size, 0, Math.PI * 2);
        ctx.fill();

        if (this.type === "freeze") {
            ctx.strokeStyle = "white";
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.lineWidth = 1;
        }
    }
}

function killEnemy(e) {
    e.dead = true;
    if (e.type === "fast")  money += 15;
    else if (e.type === "tank") money += 35;
    else if (e.type === "boss") money += 150;
    else money += 25;
    kills++;
}

class Enemy {
    constructor(type) {
        this.type = type;
        this.x = 0; this.y = PATH_Y + 10;
        this.dead = false;
        this.frozen = 0;
        this.frozenVisual = 0;

        if (type === "boss")       { this.health = 850; this.speed = 0.7; this.color = "#1a1a1a"; this.size = 60; }
        else if (type === "fast")  { this.health = 25;  this.speed = 2.5; this.color = "#3a80d2"; this.size = 30; }
        else if (type === "tank")  { this.health = 120; this.speed = 0.8; this.color = "#4a9e4a"; this.size = 30; }
        else                       { this.health = 60;  this.speed = 1.5; this.color = "#d94040"; this.size = 30; }

        this.maxHealth = this.health;
        this.baseSpeed = this.speed;
    }

    update() {
        if (this.frozen > 0) {
            this.frozen--;
            this.speed = this.baseSpeed * 0.3;
        } else {
            this.speed = this.baseSpeed;
        }
        if (this.frozenVisual > 0) this.frozenVisual--;

        this.x += this.speed;
        if (this.x > canvas.width) { this.dead = true; health -= 10; }
    }

    draw() {
        // Freeze overlay
        if (this.frozenVisual > 0) {
            ctx.fillStyle = "rgba(100,220,255,0.35)";
            ctx.fillRect(this.x - 2, this.y - 2, this.size + 4, this.size + 4);
        }

        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.size, this.size);

        // Health bar bg
        ctx.fillStyle = "#333";
        ctx.fillRect(this.x, this.y - 8, this.size, 5);
        // Health bar fill
        const hpRatio = this.health / this.maxHealth;
        ctx.fillStyle = hpRatio > 0.5 ? "lime" : hpRatio > 0.25 ? "orange" : "red";
        ctx.fillRect(this.x, this.y - 8, hpRatio * this.size, 5);

        // Frozen indicator
        if (this.frozenVisual > 0) {
            ctx.fillStyle = "rgba(150,240,255,0.9)";
            ctx.font = "10px monospace";
            ctx.fillText("❄", this.x + this.size / 2 - 5, this.y - 10);
        }
    }
}

function spawnWave() {
    waveActive = true;
    selectedTower = null;
    updateUpgradePanel();
    document.getElementById("startWaveBtn").disabled = true;

    if (wave % 5 === 0) {
        for (let i = 0; i < wave / 5; i++) {
            setTimeout(() => enemies.push(new Enemy("boss")), i * 1000);
        }
        return;
    }

    let enemyCount = Math.floor(8 + wave * 2.2);
    for (let i = 0; i < enemyCount; i++) {
        setTimeout(() => {
            let rand = Math.random();
            let type = rand < 0.6 ? "normal" : rand < 0.85 ? "fast" : "tank";
            enemies.push(new Enemy(type));
        }, i * 400);
    }
}

function updateUpgradePanel() {
    const panel = document.getElementById("upgradePanel");
    if (!selectedTower) {
        panel.style.display = "none";
        return;
    }
    panel.style.display = "block";
    const t = selectedTower;
    const nextCost = t.level < 3 ? UPGRADE_COSTS[t.level - 1] : null;
    const s = getUpgradedStats(t.type, t.level);
    const ns = t.level < 3 ? getUpgradedStats(t.type, t.level + 1) : null;

    document.getElementById("upgradeTowerName").innerText = `${towerStats[t.type].label} — Level ${t.level}`;
    document.getElementById("upgradeTowerStats").innerHTML =
        `Range: ${s.range} &nbsp;|&nbsp; Dmg: ${s.damage} &nbsp;|&nbsp; Rate: ${s.fireRate}`;

    const btn = document.getElementById("upgradeTowerBtn");
    if (nextCost === null) {
        btn.innerText = "Max Level";
        btn.disabled = true;
    } else {
        btn.innerText = `Upgrade → Lvl ${t.level + 1}  ($${nextCost})`;
        btn.disabled = money < nextCost;
    }
}

function update() {
    towers.forEach(t => t.update());
    enemies.forEach(e => !e.dead && e.update());
    projectiles.forEach(p => p.update());

    enemies = enemies.filter(e => !e.dead);
    projectiles = projectiles.filter(p => p.active);

    if (waveActive && enemies.length === 0) {
        waveActive = false; wave++; money += 60;
        document.getElementById("startWaveBtn").disabled = false;
        if (document.getElementById("autoWave").checked) {
            setTimeout(spawnWave, 1500);
        }
    }
}

function drawGrid() {
    ctx.strokeStyle = "rgba(0,0,0,0.07)";
    for (let x = 0; x < canvas.width; x += GRID_SIZE) {
        for (let y = 0; y < canvas.height; y += GRID_SIZE) {
            ctx.strokeRect(x, y, GRID_SIZE, GRID_SIZE);
        }
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid();

    // Path
    ctx.fillStyle = "#c8b89a";
    ctx.fillRect(0, PATH_Y, canvas.width, PATH_HEIGHT);
    ctx.strokeStyle = "#a89070";
    ctx.lineWidth = 2;
    ctx.strokeRect(0, PATH_Y, canvas.width, PATH_HEIGHT);
    ctx.lineWidth = 1;

    // Hover range preview
    if (previewX !== null && previewY !== null) {
        let range = towerStats[selectedTowerType].range;
        ctx.beginPath();
        ctx.arc(previewX, previewY, range, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(0,0,0,0.15)";
        ctx.stroke();
    }

    // Placement highlight
    if (hoverX !== null && hoverY !== null && !selectedTower) {
        let centerX = hoverX + GRID_SIZE / 2, centerY = hoverY + GRID_SIZE / 2;
        let cost = towerStats[selectedTowerType].cost;
        let onPath = centerY > PATH_Y && centerY < PATH_Y + PATH_HEIGHT;
        let occupied = towers.some(t => t.x === centerX && t.y === centerY);
        ctx.fillStyle = (!onPath && !occupied && money >= cost)
            ? "rgba(0,255,0,0.2)" : "rgba(255,0,0,0.2)";
        ctx.fillRect(hoverX, hoverY, GRID_SIZE, GRID_SIZE);
    }

    towers.forEach(t => t.draw());
    projectiles.forEach(p => p.draw());
    enemies.forEach(e => e.draw());

    // UI stats
    document.getElementById("health").innerText = health;
    document.getElementById("money").innerText = money;
    document.getElementById("kills").innerText = kills;
    document.getElementById("wave").innerText = wave;

    // Keep upgrade panel in sync
    if (selectedTower) updateUpgradePanel();

    if (health <= 0) {
        ctx.fillStyle = "rgba(0,0,0,0.65)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "white";
        ctx.font = "bold 48px 'Georgia', serif";
        ctx.textAlign = "center";
        ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2);
        ctx.textAlign = "left";
    }

    if (wave > MAX_WAVES && health > 0) {
        ctx.fillStyle = "rgba(0,0,0,0.65)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#ffd700";
        ctx.font = "bold 48px 'Georgia', serif";
        ctx.textAlign = "center";
        ctx.fillText("YOU WIN! 🏆", canvas.width / 2, canvas.height / 2);
        ctx.textAlign = "left";
    }
}

function gameLoop() {
    update();
    draw();
    if (health > 0 && wave <= MAX_WAVES) {
        requestAnimationFrame(gameLoop);
    }
}

// ── Input ────────────────────────────────────────────────────────────────────

canvas.addEventListener("click", e => {
    if (health <= 0 || wave > MAX_WAVES) return;

    let rect = canvas.getBoundingClientRect();
    let cx = (e.clientX - rect.left) / (rect.width / canvas.width);
    let cy = (e.clientY - rect.top) / (rect.height / canvas.height);

    let gx = Math.floor(cx / GRID_SIZE) * GRID_SIZE + GRID_SIZE / 2;
    let gy = Math.floor(cy / GRID_SIZE) * GRID_SIZE + GRID_SIZE / 2;

    // Check if clicking an existing tower → select it
    const clicked = towers.find(t => Math.abs(t.x - gx) < GRID_SIZE / 2 && Math.abs(t.y - gy) < GRID_SIZE / 2);
    if (clicked) {
        selectedTower = selectedTower === clicked ? null : clicked;
        updateUpgradePanel();
        return;
    }

    // Deselect if clicking elsewhere
    selectedTower = null;
    updateUpgradePanel();

    if (gy > PATH_Y && gy < PATH_Y + PATH_HEIGHT) return;
    let occupied = towers.some(t => t.x === gx && t.y === gy);
    if (occupied) return;

    let cost = towerStats[selectedTowerType].cost;
    if (money >= cost) {
        towers.push(new Tower(gx, gy, selectedTowerType));
        money -= cost;
    }
});

canvas.addEventListener("mousemove", e => {
    let rect = canvas.getBoundingClientRect();
    let cx = (e.clientX - rect.left) / (rect.width / canvas.width);
    let cy = (e.clientY - rect.top) / (rect.height / canvas.height);

    previewX = Math.floor(cx / GRID_SIZE) * GRID_SIZE + GRID_SIZE / 2;
    previewY = Math.floor(cy / GRID_SIZE) * GRID_SIZE + GRID_SIZE / 2;
    hoverX = Math.floor(cx / GRID_SIZE) * GRID_SIZE;
    hoverY = Math.floor(cy / GRID_SIZE) * GRID_SIZE;
});

document.querySelectorAll(".towerBtn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".towerBtn").forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        selectedTowerType = btn.dataset.type;
        selectedTower = null;
        updateUpgradePanel();
    });
});

document.getElementById("upgradeTowerBtn").addEventListener("click", () => {
    if (selectedTower) {
        selectedTower.upgrade();
        updateUpgradePanel();
    }
});

document.getElementById("startWaveBtn").addEventListener("click", () => {
    if (!waveActive) spawnWave();
});

document.getElementById("restartBtn").addEventListener("click", () => {
    towers = []; enemies = []; projectiles = [];
    money = 150; kills = 0; health = 100; wave = 1;
    waveActive = false; selectedTower = null;
    updateUpgradePanel();
    document.getElementById("startWaveBtn").disabled = false;
    gameLoop();
});

gameLoop();