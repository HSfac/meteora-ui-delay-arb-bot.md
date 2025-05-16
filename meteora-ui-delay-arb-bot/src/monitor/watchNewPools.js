const { Connection, PublicKey } = require('@solana/web3.js');
const logger = require('../utils/logger');
const { METEORA_PROGRAM_ID, RPC_ENDPOINT, MONITORING } = require('../utils/constants');
const { parsePoolTx } = require('./parsePoolTx');

// Solana 연결 설정
const connection = new Connection(RPC_ENDPOINT, 'confirmed');
const meteoraProgramId = new PublicKey(METEORA_PROGRAM_ID);

// 웹소켓 연결 상태
let wsSubscriptionId = null;

/**
 * 트랜잭션 시그니처가 유효한지 확인
 */
function isValidSignature(signature) {
  return typeof signature === 'string' && signature.length > 20;
}

/**
 * Meteora 프로그램 관련 트랜잭션 필터링
 */
function isMeteoraPoolCreationTx(accountKeys) {
  try {
    return accountKeys.some(key => key.toString() === METEORA_PROGRAM_ID);
  } catch (error) {
    logger.error(`트랜잭션 필터링 중 오류: ${error.message}`);
    return false;
  }
}

/**
 * 트랜잭션 처리 및 풀 정보 추출
 */
async function processTx(signature) {
  try {
    if (!isValidSignature(signature)) {
      return null;
    }

    logger.info(`트랜잭션 분석 중: ${signature}`);
    
    // 트랜잭션 상세 조회
    const tx = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0
    });

    // 트랜잭션이 존재하지 않거나 Meteora 프로그램 관련이 아닌 경우 스킵
    if (!tx || !isMeteoraPoolCreationTx(tx.transaction.message.accountKeys)) {
      return null;
    }

    // 트랜잭션에서 풀 생성 정보 파싱
    const poolInfo = await parsePoolTx(tx, connection);
    
    if (poolInfo) {
      logger.info(`새로운 Meteora 풀 감지됨: ${poolInfo.poolAddress}`);
      return poolInfo;
    }
  } catch (error) {
    logger.error(`트랜잭션 처리 중 오류 발생: ${error.message}`);
  }
  
  return null;
}

/**
 * WebSocket 방식으로 새로운 풀 생성 모니터링
 */
async function subscribeToNewTransactions(onNewPool) {
  try {
    // 기존 구독이 있으면 해제
    if (wsSubscriptionId !== null) {
      await connection.removeAccountChangeListener(wsSubscriptionId);
      wsSubscriptionId = null;
    }

    // 새로운, 확인된 트랜잭션에 대한 구독 설정
    wsSubscriptionId = connection.onLogs(
      meteoraProgramId,
      async (logs) => {
        try {
          if (logs.err) return;
          
          // 로그에서 시그니처 추출
          const signature = logs.signature;
          
          // 풀 정보 추출
          const poolInfo = await processTx(signature);
          
          // 콜백 실행
          if (poolInfo) {
            onNewPool(poolInfo);
          }
        } catch (error) {
          logger.error(`로그 처리 중 오류 발생: ${error.message}`);
        }
      },
      'confirmed'
    );

    logger.info('Meteora 프로그램 로그 모니터링 시작...');
    return true;
  } catch (error) {
    logger.error(`WebSocket 구독 설정 중 오류 발생: ${error.message}`);
    return false;
  }
}

/**
 * WebSocket 재연결 로직
 */
function setupWebSocketWithRetry(onNewPool) {
  subscribeToNewTransactions(onNewPool).catch(error => {
    logger.error(`WebSocket 연결 오류: ${error.message}`);
    
    // 재연결 시도
    setTimeout(() => {
      logger.info('WebSocket 재연결 시도 중...');
      setupWebSocketWithRetry(onNewPool);
    }, MONITORING.WS_RECONNECT_INTERVAL);
  });
}

/**
 * 모니터링 시작
 */
function startMonitoring(onNewPool) {
  setupWebSocketWithRetry(onNewPool);
  logger.info('Meteora 신규 풀 모니터링 시작됨');
}

/**
 * 모니터링 중지
 */
async function stopMonitoring() {
  if (wsSubscriptionId !== null) {
    await connection.removeAccountChangeListener(wsSubscriptionId);
    wsSubscriptionId = null;
    logger.info('Meteora 풀 모니터링 중지됨');
  }
}

module.exports = {
  startMonitoring,
  stopMonitoring,
  connection
}; 