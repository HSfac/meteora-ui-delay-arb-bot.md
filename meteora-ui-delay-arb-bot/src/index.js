require('dotenv').config();
const logger = require('./utils/logger');
const { startMonitoring, stopMonitoring } = require('./monitor/watchNewPools');
const { addLiquidityToPool } = require('./bot/supplyLiquidity');
const { pollForUIListing } = require('./bot/checkPoolListed');
const { notifyNewPool, notifyError } = require('./utils/notify');

// 실행 중인 풀 관리
const processingPools = new Set();

/**
 * 신규 풀 발견 시 처리 핸들러
 */
async function handleNewPool(poolInfo) {
  const { poolAddress, tokenA, tokenB, timestamp } = poolInfo;
  
  // 이미 처리 중인 풀은 건너뜀
  if (processingPools.has(poolAddress)) {
    logger.debug(`풀 ${poolAddress}은(는) 이미 처리 중입니다. 건너뜁니다.`);
    return;
  }
  
  processingPools.add(poolAddress);
  logger.info(`새로운 Meteora 풀 처리 시작: ${poolAddress}`);
  
  try {
    // 디스코드 알림 전송
    await notifyNewPool(poolAddress, tokenA, tokenB, timestamp);
    
    // 유동성 공급 시도
    const liquidityResult = await addLiquidityToPool(poolInfo);
    
    if (liquidityResult) {
      // UI 등록 여부 모니터링 시작
      const uiListingResult = await pollForUIListing(poolInfo);
      
      if (uiListingResult.listed) {
        logger.info(`🎉 전체 프로세스 완료: ${poolAddress}`);
        logger.info(`- 신규 풀 감지 -> 유동성 공급 -> UI 반영 (${uiListingResult.timeToList}초)`);
      } else {
        logger.warn(`풀 ${poolAddress}이(가) 모니터링 시간 내에 UI에 반영되지 않았습니다.`);
      }
    }
  } catch (error) {
    logger.error(`풀 ${poolAddress} 처리 중 오류 발생: ${error.message}`);
    await notifyError(`풀 ${poolAddress} 처리 실패`, error.message);
  } finally {
    // 처리 완료 후 풀 목록에서 제거
    processingPools.delete(poolAddress);
  }
}

/**
 * 메인 실행 함수
 */
async function start() {
  logger.info('Meteora UI 딜레이 차익거래 봇 시작...');
  
  try {
    // 신규 풀 모니터링 시작
    startMonitoring(handleNewPool);
    
    // 프로세스 종료 시그널 처리
    setupCleanupHandlers();
    
    logger.info('봇이 정상적으로 실행 중입니다. Ctrl+C로 중지할 수 있습니다.');
  } catch (error) {
    logger.error(`봇 실행 중 오류 발생: ${error.message}`);
    process.exit(1);
  }
}

/**
 * 정상 종료 핸들러 설정
 */
function setupCleanupHandlers() {
  const cleanup = async () => {
    logger.info('봇 종료 중...');
    
    // 모니터링 중지
    await stopMonitoring();
    
    logger.info('모든 리소스가 정상적으로 정리되었습니다. 프로그램을 종료합니다.');
    process.exit(0);
  };
  
  // SIGINT, SIGTERM 시그널 처리
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  
  // 예상치 못한 오류 처리
  process.on('uncaughtException', async (error) => {
    logger.error(`예상치 못한 오류 발생: ${error.message}`);
    await cleanup();
  });
}

// 봇 시작
start(); 