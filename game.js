const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const GRID_SIZE = 50;
const PATH_Y = 225;
const PATH_HEIGHT = 50;

const MAX_WAVES = 20;

let towers = [], enemies = [], projectiles = [];
let money = 150, kills = 0, health = 100, wave = 1;
let waveActive = false, selectedTowerType = "cannon";
let previewX = null
let previewY = null;
let hoverX = null;
let hoverY = null;
const towerStats = {
    cannon: { cost: 30, range: 160, fireRate: 50, damage: 20, color: "#2e8b57" },
    sniper: { cost: 50, range: 260, fireRate: 90, damage: 55, color: "#6a0dad" },
    rapid: { cost: 40, range: 120, fireRate: 15, damage: 10, color: "#ff8c00" }
};

class Tower {
    constructor(x, y, type) {
        const s = towerStats[type];
        this.x = x; this.y = y; this.type = type;
        this.range = s.range; this.fireRate = s.fireRate;
        this.damage = s.damage; this.color = s.color;
        this.cooldown = 0; this.angle = 0;
        this.level = 1;
    }
    update() {
        if (this.cooldown > 0) this.cooldown--;
        let target = null;
        let maxX = -1;

        enemies.forEach(e => {
            if (e.dead) return;
            let dx = e.x - this.x;
            let dy = e.y - this.y;
            let dist = Math.sqrt(dx * dx + dy * dy);

            if (dist <= this.range && e.x > maxX) {
                maxX = e.x;
                target = e;
            }
        });
        if (target) {
            let dx = target.x - this.x;
            let dy = target.y - this.y;
            this.angle = Math.atan2(dy, dx);
            if (this.cooldown <= 0) {
                projectiles.push(new Projectile(this.x, this.y, target, this.damage, this.type));
                this.cooldown = this.fireRate;
            }
        }
    }
    draw() {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x - 20, this.y - 20, 40, 40);

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.fillStyle = "black";
        ctx.fillRect(0, -4, 30, 8);
        ctx.restore();
    }
}

class Projectile {
    constructor(x, y, target, damage, type) {
        this.x = x;
        this.y = y;
        this.target = target;
        this.damage = damage;
        this.type = type;
        this.speed = 6;
        this.active = true;
        this.size = 6;
        this.color = towerStats[type].color;
        this.type = type;
    }

    update() {
        if (!this.target || this.target.dead) {
            this.active = false;
            return;
        }

        let dx = this.target.x - this.x;
        let dy = this.target.y - this.y;
        let d = Math.sqrt(dx * dx + dy * dy);

        if (d < 6) {

            if (this.type === "cannon") {
                let splashRadius = 60;

                enemies.forEach(e => {
                    let dx = e.x - this.target.x;
                    let dy = e.y - this.target.y;
                    let dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < splashRadius) {
                        e.health -= this.damage;
                        if (e.health <= 0 && !e.dead) {
                            e.dead = true;
                            if (e.type === "fast") money += 15;
                            else if (e.type === "tank") money += 35;
                            else if (e.type === "boss") money += 150;
                            else money += 25;
                            kills++;
                        }
                    }
                });

            } else {
                this.target.health -= this.damage;
            }

            this.active = false;
            return;
        }

        this.x += dx / d * this.speed;
        this.y += dy / d * this.speed;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

class Enemy {
    constructor(type) {
        this.type = type;
        this.x = 0;
        this.y = PATH_Y + 10;
        this.dead = false;

        if (type === "boss") {
            this.health = 400;
            this.speed = 0.7;
            this.color = "black";
            this.size = 60;
        }
        else if (type === "fast") {
            this.health = 25;
            this.speed = 2.5;
            this.color = "blue";
            this.size = 30;
        }
        else if (type === "tank") {
            this.health = 120;
            this.speed = 0.8;
            this.color = "green";
            this.size = 30;
        }
        else {
            this.health = 60;
            this.speed = 1.5;
            this.color = "red";
            this.size = 30;
        }

        this.maxHealth = this.health;
    }

    update() {
        this.x += this.speed;
        if (this.x > canvas.width) { this.dead = true; health -= 10; }
    }
    draw() {
        let barHeight = this.type === "boss" ? 8 : 4;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.size, this.size);

        ctx.fillStyle = "lime";
        ctx.fillRect(
            this.x,
            this.y - 6,
            (this.health / this.maxHealth) * this.size,
            4
        );
    }
}

function spawnWave() {
    waveActive = true;
    document.getElementById("startWaveBtn").disabled = true;

    // Boss wave every 5 waves
    if (wave % 5 === 0) {
        for (let i = 0; i < wave / 5; i++) {
            setTimeout(() => {
                enemies.push(new Enemy("boss"));
            }, i * 1000);
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

    if (wave > MAX_WAVES) {
        ctx.fillStyle = "black";
        ctx.font = "40px Arial";
        ctx.fillText("YOU WIN!", canvas.width / 2 - 100, canvas.height / 2);
        return;
    }
}

function drawGrid() {
    ctx.strokeStyle = "#ddd";
    for (let x = 0; x < canvas.width; x += GRID_SIZE) {
        for (let y = 0; y < canvas.height; y += GRID_SIZE) {
            ctx.strokeRect(x, y, GRID_SIZE, GRID_SIZE);
        }
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid();

    ctx.fillStyle = "#bbb";
    ctx.fillRect(0, PATH_Y, canvas.width, PATH_HEIGHT);

    // Range preview
    if (previewX !== null && previewY !== null) {
        let range = towerStats[selectedTowerType].range;
        ctx.beginPath();
        ctx.arc(previewX, previewY, range, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(0,0,0,0.2)";
        ctx.stroke();
    }

    // Placement preview
    if (hoverX !== null && hoverY !== null) {
        let centerX = hoverX + GRID_SIZE / 2;
        let centerY = hoverY + GRID_SIZE / 2;

        let cost = towerStats[selectedTowerType].cost;
        let onPath = centerY > PATH_Y && centerY < PATH_Y + PATH_HEIGHT;
        let occupied = towers.some(t => t.x === centerX && t.y === centerY);

        if (!onPath && !occupied && money >= cost) {
            ctx.fillStyle = "rgba(0,255,0,0.25)";
        } else {
            ctx.fillStyle = "rgba(255,0,0,0.25)";
        }

        ctx.fillRect(hoverX, hoverY, GRID_SIZE, GRID_SIZE);
    }

    towers.forEach(t => t.draw());
    projectiles.forEach(p => p.draw());
    enemies.forEach(e => e.draw());

    // UI update
    document.getElementById("health").innerText = health;
    document.getElementById("money").innerText = money;
    document.getElementById("kills").innerText = kills;
    document.getElementById("wave").innerText = wave;

    // GAME OVER
    if (health <= 0) {
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "white";
        ctx.font = "40px Arial";
        ctx.fillText("GAME OVER", canvas.width / 2 - 140, canvas.height / 2);
    }

    // YOU WIN
    if (wave > MAX_WAVES) {
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "white";
        ctx.font = "40px Arial";
        ctx.fillText("YOU WIN!", canvas.width / 2 - 110, canvas.height / 2);
    }
}

function gameLoop() {
    update();
    draw();
    if (health > 0 && wave <= MAX_WAVES) {
        requestAnimationFrame(gameLoop);
    }
}

canvas.addEventListener("click", e => {
    if (health <= 0 || wave > MAX_WAVES) return;

    let rect = canvas.getBoundingClientRect();
    let gx = Math.floor((e.clientX - rect.left) / GRID_SIZE) * GRID_SIZE + GRID_SIZE / 2;
    let gy = Math.floor((e.clientY - rect.top) / GRID_SIZE) * GRID_SIZE + GRID_SIZE / 2;
    if (gy > PATH_Y && gy < PATH_Y + PATH_HEIGHT) return;

    let occupied = towers.some(t => t.x === gx && t.y === gy);
    if (occupied) return;

    let cost = towerStats[selectedTowerType].cost;
    if (money >= cost) {
        towers.push(new Tower(gx, gy, selectedTowerType));
        money -= cost;
    }

}
);

canvas.addEventListener("mousemove", e => {
    let rect = canvas.getBoundingClientRect();
    let gx = Math.floor((e.clientX - rect.left) / GRID_SIZE) * GRID_SIZE + GRID_SIZE / 2;
    let gy = Math.floor((e.clientY - rect.top) / GRID_SIZE) * GRID_SIZE + GRID_SIZE / 2;
    previewX = gx;
    previewY = gy;

    hoverX = Math.floor((e.clientX - rect.left) / GRID_SIZE) * GRID_SIZE;
    hoverY = Math.floor((e.clientY - rect.top) / GRID_SIZE) * GRID_SIZE;
});

document.querySelectorAll(".towerBtn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".towerBtn").forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        selectedTowerType = btn.dataset.type;
    });
});

document.getElementById("startWaveBtn").addEventListener("click", () => {
    if (!waveActive) spawnWave();
});

document.getElementById("restartBtn").addEventListener("click", () => {
    towers = []; enemies = []; projectiles = [];
    money = 150; kills = 0; health = 100; wave = 1;
    waveActive = false;
    document.getElementById("startWaveBtn").disabled = false;
});

gameLoop();