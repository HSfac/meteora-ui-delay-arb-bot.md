const { PublicKey } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const logger = require('../utils/logger');
const { METEORA_PROGRAM_ID } = require('../utils/constants');

/**
 * 계정 정보에서 풀 생성 이벤트 식별
 */
function findPoolCreationData(accounts, logs) {
  try {
    // 로그에서 풀 생성 이벤트 찾기
    const poolCreationLog = logs.find(log => 
      log.includes('createPool') || 
      log.includes('initialize') || 
      log.includes('createLiquidity')
    );

    if (!poolCreationLog) {
      return null;
    }

    // Meteora 계정 필터링 (프로그램 ID, 토큰 프로그램 등)
    const relevantAccounts = accounts.filter(account => {
      if (!account.executable) {
        // 풀 주소 후보 (실행 불가능한 계정)
        return true;
      } else if (account.owner.equals(new PublicKey(METEORA_PROGRAM_ID))) {
        // Meteora 프로그램이 소유한 계정
        return true;
      } else if (account.owner.equals(TOKEN_PROGRAM_ID)) {
        // 토큰 계정
        return true;
      }
      return false;
    });
    
    // 가능한 풀 주소 찾기 (첫 번째 실행 불가능 계정으로 가정)
    const possiblePoolAddress = relevantAccounts.find(account => !account.executable);
    
    if (!possiblePoolAddress) {
      return null;
    }

    // 토큰 계정 (A, B) 찾기
    const tokenAccounts = relevantAccounts.filter(account => 
      account.owner.equals(TOKEN_PROGRAM_ID)
    );

    if (tokenAccounts.length < 2) {
      return null;
    }

    return {
      poolAddress: possiblePoolAddress.pubkey.toString(),
      tokenAccounts: tokenAccounts.map(acc => acc.pubkey.toString()),
      logs: poolCreationLog
    };
  } catch (error) {
    logger.error(`풀 생성 데이터 파싱 중 오류: ${error.message}`);
    return null;
  }
}

/**
 * 토큰 계정 정보 조회
 */
async function getTokenInfo(tokenAccount, connection) {
  try {
    const accountInfo = await connection.getAccountInfo(new PublicKey(tokenAccount));
    
    if (!accountInfo) {
      return null;
    }
    
    // 토큰 민트 주소 및 정보 조회
    const TOKEN_ACCOUNT_DATA_LAYOUT = {
      mint: [0, 32],
    };
    const mintAddress = new PublicKey(accountInfo.data.slice(...TOKEN_ACCOUNT_DATA_LAYOUT.mint));
    
    // 토큰 메타데이터 (심볼, 이름 등) 조회는 생략
    // 실제 구현 시에는 Jupiter API나 Token List에서 가져오는 것이 좋음
    
    return {
      tokenAccount,
      mintAddress: mintAddress.toString(),
    };
  } catch (error) {
    logger.error(`토큰 정보 조회 중 오류: ${error.message}`);
    return null;
  }
}

/**
 * 트랜잭션에서 풀 정보 파싱
 */
async function parsePoolTx(transaction, connection) {
  try {
    if (!transaction || !transaction.meta) {
      return null;
    }

    const accounts = transaction.meta.postTokenBalances || [];
    const logs = transaction.meta.logMessages || [];
    
    // 풀 생성 데이터 찾기
    const poolData = findPoolCreationData(
      transaction.transaction.message.accountKeys.map((pubkey, index) => ({
        pubkey,
        executable: transaction.meta.staticAccountKeys[index]?.executable || false,
        owner: transaction.meta.staticAccountKeys[index]?.owner || null
      })),
      logs
    );
    
    if (!poolData) {
      return null;
    }
    
    // 토큰 계정 정보 조회
    const tokenInfoPromises = poolData.tokenAccounts.map(account => 
      getTokenInfo(account, connection)
    );
    
    const tokenInfos = await Promise.all(tokenInfoPromises);
    const validTokenInfos = tokenInfos.filter(info => info !== null);
    
    if (validTokenInfos.length < 2) {
      return null;
    }
    
    // 최종 풀 정보 반환
    return {
      poolAddress: poolData.poolAddress,
      tokenA: validTokenInfos[0].mintAddress,
      tokenB: validTokenInfos[1].mintAddress,
      timestamp: transaction.blockTime ? new Date(transaction.blockTime * 1000) : new Date(),
      logs: poolData.logs
    };
  } catch (error) {
    logger.error(`트랜잭션 파싱 중 오류: ${error.message}`);
    return null;
  }
}

module.exports = {
  parsePoolTx
}; 