const axios = require('axios');
const logger = require('./logger');
require('dotenv').config();

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

/**
 * 디스코드에 메시지 전송
 * @param {string} title - 알림 제목
 * @param {string} message - 알림 내용
 * @param {string} color - 임베드 색상 (16진수)
 * @param {Object} fields - 추가 필드 (선택사항)
 */
async function sendDiscordNotification(title, message, color = '#00ff00', fields = []) {
  if (!DISCORD_WEBHOOK_URL) {
    logger.warn('디스코드 웹훅 URL이 설정되지 않았습니다. 알림을 건너뜁니다.');
    return;
  }

  try {
    const payload = {
      embeds: [
        {
          title,
          description: message,
          color: parseInt(color.replace('#', ''), 16),
          fields,
          timestamp: new Date().toISOString()
        }
      ]
    };

    await axios.post(DISCORD_WEBHOOK_URL, payload);
    logger.info(`디스코드 알림 전송 완료: ${title}`);
  } catch (error) {
    logger.error(`디스코드 알림 전송 실패: ${error.message}`);
  }
}

/**
 * 신규 풀 감지 알림
 */
function notifyNewPool(poolAddress, tokenA, tokenB, timestamp) {
  return sendDiscordNotification(
    '🔍 신규 풀 감지됨',
    `Meteora에서 새로운 유동성 풀이 생성되었습니다!`,
    '#3498db',
    [
      { name: '풀 주소', value: poolAddress, inline: false },
      { name: '토큰 페어', value: `${tokenA} / ${tokenB}`, inline: true },
      { name: '생성 시간', value: new Date(timestamp).toLocaleString(), inline: true }
    ]
  );
}

/**
 * 유동성 공급 성공 알림
 */
function notifyLiquidityAdded(poolAddress, amount, txHash) {
  return sendDiscordNotification(
    '✅ 유동성 공급 성공',
    `선제적으로 유동성 공급에 성공했습니다!`,
    '#2ecc71',
    [
      { name: '풀 주소', value: poolAddress, inline: false },
      { name: '공급 수량', value: amount.toString(), inline: true },
      { name: '트랜잭션', value: `[Explorer에서 보기](https://solscan.io/tx/${txHash})`, inline: true }
    ]
  );
}

/**
 * 오류 알림
 */
function notifyError(errorMessage, details) {
  return sendDiscordNotification(
    '❌ 오류 발생',
    errorMessage,
    '#e74c3c',
    [{ name: '오류 상세', value: details || 'No details', inline: false }]
  );
}

module.exports = {
  sendDiscordNotification,
  notifyNewPool,
  notifyLiquidityAdded,
  notifyError
}; 