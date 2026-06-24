const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

// AAQ-37 DASの6つの赤外線カメラの配置情報
const DAS_SENSORS = [
    { id: 'DAS-1', position: 'Forward-Top', fov: 'Frontal hemisphere' },
    { id: 'DAS-2', position: 'Forward-Bottom', fov: 'Frontal lower' },
    { id: 'DAS-3', position: 'Starboard (Right)', fov: 'Right side' },
    { id: 'DAS-4', position: 'Port (Left)', fov: 'Left side' },
    { id: 'DAS-5', position: 'Aft-Top', fov: 'Rear upper' },
    { id: 'DAS-6', position: 'Aft-Bottom', fov: 'Rear lower' }
];

// アクティブな脅威（ミサイルや航空機など）のリスト
let activeThreats = [];

// 定期的に新しい脅威を発生させる関数
function generateThreat() {
    if (activeThreats.length >= 3) return; // 同時追跡上限数を仮に3個とする

    const id = `TRT-${Math.floor(1000 + Math.random() * 9000)}`;
    const types = ['Missile (SAM)', 'Missile (AAM)', 'Hostile Aircraft'];
    
    activeThreats.push({
        id: id,
        type: types[Math.floor(Math.random() * types.length)],
        distance: 120, // 初期距離 (km)
        azimuth: Math.floor(Math.random() * 360), // 方位角 0-359度
        elevation: Math.floor(-45 + Math.random() * 90), // 仰俯角 -45〜+45度
        speed: 1.5 + Math.random() * 3 // マッハ数
    });
    console.log(`[DAS] 警告: 新しい脅威を検知しました: ${id}`);
}

// センサーデータの更新とクライアントへの送信
function updateDasSimulation() {
    // 距離を縮める（アプローチシミュレーション）
    activeThreats = activeThreats.map(threat => {
        // マッハ数に応じて距離を減算
        const newDistance = threat.distance - (threat.speed * 0.5);
        return { ...threat, distance: parseFloat(newDistance.toFixed(2)) };
    }).filter(threat => {
        if (threat.distance <= 0) {
            console.log(`[DAS] 脅威 ${threat.id} が範囲外、または着弾/消失しました。`);
            return false;
        }
        return true;
    });

    // どのセンサーがどの脅威を捉えているかをマッピング
    const sensorTelemetry = DAS_SENSORS.map(sensor => {
        const detectedThreats = activeThreats.map(threat => {
            // 方位角に応じて担当センサーを簡易的に紐付け
            let isVisible = false;
            if (sensor.position === 'Forward-Top' && (threat.azimuth <= 60 || threat.azimuth >= 300) && threat.elevation >= 0) isVisible = true;
            if (sensor.position === 'Forward-Bottom' && (threat.azimuth <= 60 || threat.azimuth >= 300) && threat.elevation < 0) isVisible = true;
            if (sensor.position === 'Starboard (Right)' && (threat.azimuth > 60 && threat.azimuth < 120)) isVisible = true;
            if (sensor.position === 'Port (Left)' && (threat.azimuth > 240 && threat.azimuth < 300)) isVisible = true;
            if (sensor.position === 'Aft-Top' && (threat.azimuth >= 120 && threat.azimuth <= 240) && threat.elevation >= 0) isVisible = true;
            if (sensor.position === 'Aft-Bottom' && (threat.azimuth >= 120 && threat.azimuth <= 240) && threat.elevation < 0) isVisible = true;

            if (isVisible) {
                return {
                    targetId: threat.id,
                    type: threat.type,
                    azimuth: threat.azimuth,
                    elevation: threat.elevation,
                    rangeKm: threat.distance,
                    signalStrength: parseFloat((100 / (threat.distance + 1)).toFixed(1)) // 距離が近いほど信号が強い
                };
            }
            return null;
        }).filter(t => t !== null);

        return {
            sensorId: sensor.id,
            location: sensor.position,
            status: 'ACTIVE',
            targets: detectedThreats
        };
    });

    // WebSocketで全クライアントにブロードキャスト
    const payload = JSON.stringify({
        timestamp: new Date().toISOString(),
        systemStatus: 'NOMINAL',
        sensors: sensorTelemetry
    });

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

// インターバル設定
setInterval(generateThreat, 10000); // 10秒ごとに脅威抽選
setInterval(updateDasSimulation, 1000); // 1秒ごとにテレメトリ更新

// サーバー起動
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`AN/AAQ-37 DAS Simulator が起動しました。 http://localhost:${PORT}`);
});