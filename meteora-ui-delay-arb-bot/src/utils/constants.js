require('dotenv').config();

// Meteora 프로그램 ID (메인넷)
const METEORA_PROGRAM_ID = 'M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K';

// RPC 엔드포인트
const RPC_ENDPOINT = process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';

// 모니터링 설정
const MONITORING = {
  POOL_CREATION_EVENT: 'createLiquidity', // Meteora 풀 생성 이벤트 이름
  POLLING_INTERVAL: 2000, // 풀링 간격 (ms)
  WS_RECONNECT_INTERVAL: 5000, // WebSocket 재연결 간격 (ms)
};

// Jupiter API 엔드포인트
const JUPITER_API = 'https://quote-api.jup.ag/v4';

// Meteora API 엔드포인트 (풀 조회용)
const METEORA_API = 'https://api.meteora.ag/pools';

// 유동성 공급 설정
const LIQUIDITY = {
  MIN_SOL_BALANCE: 0.1, // 최소 SOL 유지 잔액
  MAX_LP_PERCENTAGE: 80, // 보유 토큰의 최대 투입 비율 (%)
  SLIPPAGE: 1, // 슬리피지 허용치 (%)
};

// 매직 이더 전송 설정
const TX_DEFAULTS = {
  maxRetries: 3,
  skipPreflight: true, // 빠른 트랜잭션을 위해 프리플라이트 검사 건너뛰기
  confirmation: 'confirmed', // 확인 레벨
};

module.exports = {
  METEORA_PROGRAM_ID,
  RPC_ENDPOINT,
  MONITORING,
  JUPITER_API,
  METEORA_API,
  LIQUIDITY,
  TX_DEFAULTS,
}; 