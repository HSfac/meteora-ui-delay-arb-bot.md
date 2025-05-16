const { 
  Connection, 
  PublicKey, 
  Keypair, 
  Transaction, 
  TransactionInstruction, 
  SystemProgram, 
  sendAndConfirmTransaction 
} = require('@solana/web3.js');
const { 
  TOKEN_PROGRAM_ID, 
  getOrCreateAssociatedTokenAccount, 
  getAssociatedTokenAddress 
} = require('@solana/spl-token');
const logger = require('../utils/logger');
const { notifyLiquidityAdded, notifyError } = require('../utils/notify');
const { METEORA_PROGRAM_ID, RPC_ENDPOINT, LIQUIDITY, TX_DEFAULTS } = require('../utils/constants');

// 환경 변수에서 비공개 키 가져오기
require('dotenv').config();
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!PRIVATE_KEY) {
  logger.error('PRIVATE_KEY가 환경 변수에 설정되지 않았습니다.');
  process.exit(1);
}

// 지갑 설정
const connection = new Connection(RPC_ENDPOINT, 'confirmed');
const meteoraProgramId = new PublicKey(METEORA_PROGRAM_ID);
const wallet = Keypair.fromSecretKey(Buffer.from(PRIVATE_KEY, 'hex'));

/**
 * 토큰 잔액 조회
 */
async function getTokenBalance(tokenMint) {
  try {
    const tokenAccountAddress = await getAssociatedTokenAddress(
      new PublicKey(tokenMint),
      wallet.publicKey
    );
    
    // 토큰 계정이 있는지 확인
    const tokenAccount = await connection.getAccountInfo(tokenAccountAddress);
    
    if (!tokenAccount) {
      return 0;
    }
    
    // 잔액 조회
    const accountInfo = await connection.getTokenAccountBalance(tokenAccountAddress);
    return accountInfo.value.uiAmount || 0;
  } catch (error) {
    logger.error(`토큰 잔액 조회 중 오류: ${error.message}`);
    return 0;
  }
}

/**
 * Meteora 풀에 유동성 공급
 */
async function addLiquidityToPool(poolInfo) {
  try {
    logger.info(`유동성 공급 시작: ${poolInfo.poolAddress}`);
    
    // 풀 주소 객체 생성
    const poolAddress = new PublicKey(poolInfo.poolAddress);
    
    // 토큰 A, B 주소 객체 생성
    const tokenAMint = new PublicKey(poolInfo.tokenA);
    const tokenBMint = new PublicKey(poolInfo.tokenB);
    
    // 토큰 잔액 조회
    const tokenABalance = await getTokenBalance(tokenAMint);
    const tokenBBalance = await getTokenBalance(tokenBMint);
    
    logger.info(`토큰 잔액 - ${poolInfo.tokenA}: ${tokenABalance}, ${poolInfo.tokenB}: ${tokenBBalance}`);
    
    // 잔액이 부족한 경우 처리
    if (tokenABalance <= 0 || tokenBBalance <= 0) {
      logger.warn('토큰 잔액이 부족하여 유동성 공급을 건너뜁니다.');
      return null;
    }
    
    // 공급할 유동성 양 계산 (보유량의 일정 비율)
    const tokenAAmount = tokenABalance * (LIQUIDITY.MAX_LP_PERCENTAGE / 100);
    const tokenBAmount = tokenBBalance * (LIQUIDITY.MAX_LP_PERCENTAGE / 100);
    
    // 토큰 계정 조회 또는 생성
    const tokenAAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet,
      tokenAMint,
      wallet.publicKey
    );
    
    const tokenBAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet,
      tokenBMint,
      wallet.publicKey
    );
    
    // LP 토큰 계정 주소 조회 (PDA)
    const [lpTokenAccount] = await PublicKey.findProgramAddress(
      [Buffer.from('lp-token'), poolAddress.toBuffer()],
      meteoraProgramId
    );
    
    // 유동성 공급 명령어 생성 
    // 참고: 실제 구현에서는 Meteora의 정확한 명령어 구조와 버퍼 레이아웃을 사용해야 함
    // 여기서는 단순화된 예시로 구현
    const addLiquidityIx = new TransactionInstruction({
      keys: [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: poolAddress, isSigner: false, isWritable: true },
        { pubkey: tokenAAccount.address, isSigner: false, isWritable: true },
        { pubkey: tokenBAccount.address, isSigner: false, isWritable: true },
        { pubkey: lpTokenAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: meteoraProgramId,
      data: Buffer.from([
        0x03, // add_liquidity 명령어 (예시 - 실제로는 Meteora SDK 또는 IDL 참조)
        ...new Uint8Array(8).fill(0), // tokenAAmount 직렬화 (예시)
        ...new Uint8Array(8).fill(0), // tokenBAmount 직렬화 (예시)
      ]),
    });
    
    // 트랜잭션 생성 및 전송
    const transaction = new Transaction().add(addLiquidityIx);
    transaction.feePayer = wallet.publicKey;
    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    
    // 트랜잭션 서명 및 전송
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [wallet],
      {
        skipPreflight: TX_DEFAULTS.skipPreflight,
        commitment: TX_DEFAULTS.confirmation,
        maxRetries: TX_DEFAULTS.maxRetries
      }
    );
    
    logger.info(`유동성 공급 성공! 트랜잭션: ${signature}`);
    
    // 디스코드 알림 전송
    await notifyLiquidityAdded(
      poolInfo.poolAddress,
      `${tokenAAmount} / ${tokenBAmount}`,
      signature
    );
    
    return {
      signature,
      poolAddress: poolInfo.poolAddress,
      tokenAAmount,
      tokenBAmount
    };
  } catch (error) {
    logger.error(`유동성 공급 중 오류 발생: ${error.message}`);
    await notifyError('유동성 공급 실패', `풀: ${poolInfo.poolAddress}, 오류: ${error.message}`);
    return null;
  }
}

module.exports = {
  addLiquidityToPool
}; 