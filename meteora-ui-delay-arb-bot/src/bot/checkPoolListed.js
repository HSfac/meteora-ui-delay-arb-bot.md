const axios = require('axios');
const logger = require('../utils/logger');
const { JUPITER_API, METEORA_API } = require('../utils/constants');

/**
 * Jupiter API를 통해 풀 등록 여부 확인
 */
async function checkJupiterListing(tokenA, tokenB) {
  try {
    // Jupiter API에서 경로 조회
    const response = await axios.get(`${JUPITER_API}/quote`, {
      params: {
        inputMint: tokenA,
        outputMint: tokenB,
        amount: 1000000, // 1 USDC 단위로 가정
        slippage: 0.5
      },
      timeout: 5000 // 5초 타임아웃
    });

    if (response.data && response.data.data) {
      // 라우팅 정보 확인
      const routes = response.data.data.routesInfos || [];
      
      // Meteora 풀을 사용하는 경로가 있는지 확인
      const meteoraRouteExists = routes.some(route => 
        route.marketInfos && 
        route.marketInfos.some(market => 
          market.amm && 
          market.amm.toLowerCase().includes('meteora')
        )
      );
      
      return meteoraRouteExists;
    }
  } catch (error) {
    logger.warn(`Jupiter API 확인 중 오류: ${error.message}`);
  }
  
  return false;
}

/**
 * Meteora API를 통해 풀 등록 여부 확인
 */
async function checkMeteoraListing(poolAddress) {
  try {
    // Meteora API에서 풀 정보 조회
    const response = await axios.get(`${METEORA_API}/${poolAddress}`, {
      timeout: 5000 // 5초 타임아웃
    });
    
    // 응답이 성공적이고, 풀 데이터가 있으면 등록된 것으로 간주
    return response.status === 200 && response.data;
  } catch (error) {
    // 404 오류는 풀이 아직 등록되지 않았음을 의미 (정상적인 경우)
    if (error.response && error.response.status === 404) {
      return false;
    }
    
    logger.warn(`Meteora API 확인 중 오류: ${error.message}`);
    return false;
  }
}

/**
 * UI에 풀이 반영되었는지 주기적으로 확인
 */
async function pollForUIListing(poolInfo, maxRetries = 30, intervalMs = 10000) {
  let retries = 0;
  
  logger.info(`UI 반영 여부 모니터링 시작: ${poolInfo.poolAddress}`);
  
  return new Promise((resolve) => {
    const checkInterval = setInterval(async () => {
      retries++;
      
      // Jupiter와 Meteora UI 확인
      const [jupiterListed, meteoraListed] = await Promise.all([
        checkJupiterListing(poolInfo.tokenA, poolInfo.tokenB),
        checkMeteoraListing(poolInfo.poolAddress)
      ]);
      
      let status = [];
      if (jupiterListed) status.push('Jupiter');
      if (meteoraListed) status.push('Meteora');
      
      if (status.length > 0) {
        logger.info(`🎉 풀이 UI에 반영됨! ${status.join(', ')}`);
        clearInterval(checkInterval);
        resolve({
          poolAddress: poolInfo.poolAddress,
          listed: true,
          platforms: status,
          timeToList: retries * (intervalMs / 1000) // 초 단위
        });
      } else if (retries >= maxRetries) {
        logger.warn(`최대 재시도 횟수 초과. UI 반영 여부 모니터링 종료.`);
        clearInterval(checkInterval);
        resolve({
          poolAddress: poolInfo.poolAddress,
          listed: false,
          timeToList: null
        });
      } else {
        logger.debug(`UI 반영 대기 중... (${retries}/${maxRetries})`);
      }
    }, intervalMs);
  });
}

module.exports = {
  pollForUIListing,
  checkJupiterListing,
  checkMeteoraListing
}; 