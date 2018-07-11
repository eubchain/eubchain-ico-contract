import ether from 'zeppelin-solidity/test/helpers/ether';
import { advanceBlock } from 'zeppelin-solidity/test/helpers/advanceToBlock';
import { 
  increaseTimeTo, 
  duration 
} from 'zeppelin-solidity/test/helpers/increaseTime';
import latestTime from 'zeppelin-solidity/test/helpers/latestTime';
import EVMRevert from 'zeppelin-solidity/test/helpers/EVMRevert';

const BigNumber = web3.BigNumber;

const should = require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should();

const EubChainIco = artifacts.require('./EubChainIco.sol');

contract('EubChainIco', ([
  fundsWallet,
  teamWallet,
  communityWallet,
  foundationWallet,
  investor3Wallet,
  purchaseTester,
  purchaseTester2,
  purchaseTester3
]) => {
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

  const decimals = 8;
  const rate = 10000;  // 1 ETH = 10000 EUB
  const totalSupply = 1000000000 * Math.pow(10, decimals);  // 1 billion tokens
  const minInvestment = 1 * Math.pow(10, 18 - decimals);

  const teamShare = 10;
  const communityShare = 10;
  const foundationShare = 10;
  const icoShare = 30;
  const operationShare = 40;
  const teamLockfreeShare = 2;

  // TODO: Move to destination
  const teamVestedPeriod = duration.days(6 * 30);
  const icoVestedPercentage = 85;
  const minVestLockMonths = 3;
  
  const teamTokens = totalSupply * teamShare / 100;
  const teamLockfreeTokens = totalSupply * teamLockfreeShare / 100;
  const communityTokens = totalSupply * communityShare / 100;
  const foundationTokens = totalSupply * foundationShare / 100;
  const operationTokens = totalSupply * operationShare / 100;

  const icoCap = totalSupply * icoShare / 100;
  const icoCapInEther = icoCap / (rate * Math.pow(10, decimals));   // Maximum eth cap

  const teamLockPeriod = duration.years(1);

  before(async function () {
    // Advance to the next block to correctly read time in the solidity "now" function interpreted by testrpc
    await advanceBlock();
  });

  beforeEach(async function () {
    this.startTime = latestTime() + duration.days(1);
    this.endTime = this.startTime + duration.days(30);
    this.afterEndTime = this.endTime + duration.seconds(1);
    this.afterTeamLockEndTime = this.startTime + teamLockPeriod + duration.seconds(1);
    this.afterTeamVestLockEndTime = this.startTime + teamLockPeriod + teamVestedPeriod;

    this.token = await EubChainIco.new(
      fundsWallet,
      teamWallet,
      communityWallet,
      foundationWallet
    );
  });

  describe('init EubChainIco', async function () {

    it('should assign correct amounts of token to wallets', async function () {
      const teamBalance = await this.token.balanceOf(teamWallet);
      teamBalance.should.be.bignumber.equal(teamLockfreeTokens);

      const communityBalance = await this.token.balanceOf(communityWallet);
      communityBalance.should.be.bignumber.equal(communityTokens - teamLockfreeTokens);

      const foundationBalance = await this.token.balanceOf(foundationWallet);
      foundationBalance.should.be.bignumber.equal(foundationTokens);

      const expectedFundsAmount = totalSupply - teamTokens - communityTokens - foundationTokens - operationTokens;
      const fundsBalance = await this.token.balanceOf(fundsWallet);
      fundsBalance.should.be.bignumber.equal(expectedFundsAmount);
    })

  })

  describe('isIcoOpen', function () {

    it('should return true if cap is not reached', async function () {
      await this.token.vestedTransfer(purchaseTester, 1, 3, { from: fundsWallet });
      const result = await this.token.isIcoOpen();
      result.should.equal(true);
    })

    it('should return false if cap is reached', async function () {
      await this.token.vestedTransfer(purchaseTester, icoCap, 3, { from: fundsWallet });
      const result = await this.token.isIcoOpen();
      result.should.equal(false);
    })

  })

  describe('isPurchaseWithinCap', function () {

    it('should return false if remaining tokens are smaller than purchase amount', async function () {
      if (this.token.isPurchaseWithinCap) {
        let result = await this.token.isPurchaseWithinCap(icoCap, minInvestment);
        result.should.be.equal(false);

        result = await this.token.isPurchaseWithinCap(icoCap - minInvestment, minInvestment * 2);
        result.should.be.equal(false);

        result = await this.token.isPurchaseWithinCap(0, icoCap + minInvestment);
        result.should.be.equal(false);
      }
    })

    it('should return true if remaining tokens are larger than purchase amount', async function () {
      if (this.token.isPurchaseWithinCap) {
        let result = await this.token.isPurchaseWithinCap(0, minInvestment);
        result.should.be.equal(true);

        result = await this.token.isPurchaseWithinCap(icoCap - minInvestment * 10, minInvestment * 5);
        result.should.be.equal(true);
      }
    })

    it('should return true if remaining tokens are equal purchase amount', async function () {
      if (this.token.isPurchaseWithinCap) {
        let result = await this.token.isPurchaseWithinCap(icoCap - minInvestment, minInvestment);
        result.should.be.equal(true);

        result = await this.token.isPurchaseWithinCap(0, icoCap);
        result.should.be.equal(true);
      }
    })

  })

  describe('allowPurchase', function () {

    it('should return true if purchase is non-zero', async function () {
      if (this.token.allowPurchase) {
        const result = await this.token.allowPurchase(minInvestment);
        result.should.be.equal(true);
      }
    })

    it('should return false if purchase is zero', async function () {
      if (this.token.allowPurchase) {
        const result = await this.token.allowPurchase(0);
        result.should.be.equal(false);
      }
    })

    it('should return false if ico cap has reached', async function () {
      await this.token.vestedTransfer(purchaseTester, icoCap, minVestLockMonths, { from: fundsWallet });
      const result = await this.token.allowPurchase(minInvestment);
      result.should.equal(false);
    })
  })

  describe('allowTransfer', function () {

    it('should allow transfer if sender is not being locked', async function () {
      if (this.token.allowTransfer) {
        const result = await this.token.allowTransfer(communityWallet, 1);
        result.should.be.equal(true);

        const result2 = await this.token.allowTransfer(foundationWallet, 1);
        result2.should.be.equal(true);
      }
    })

    // it('should reject if locked accounts transfer within teamLockPeriod', async function() {
    //   if (this.token.allowTransfer) {
    //     await this.token.lockedTransfer(purchaseTester, 1, { from: teamWallet }).should.be.fulfilled;
    //     const result = await this.token.allowTransfer(purchaseTester, 1);
    //     result2.should.be.equal(false);
    //   }
    // })

    it('should reject if teamWallet transfers more than teamLockfreeTokens within teamLockPeriod', async function () {
      if (this.token.allowTransfer) {
        const result = await this.token.allowTransfer(teamWallet, teamLockfreeTokens + 1);
        result.should.be.equal(false);

        await this.token.transfer(purchaseTester, teamLockfreeTokens / 2, { from: teamWallet }).should.be.fulfilled;
        const result2 = await this.token.allowTransfer(teamWallet, teamLockfreeTokens);
        result2.should.be.equal(false);
      }
    })

    it('should accept if teamWallet transfers less than teamLockfreeTokens within teamLockPeriod', async function () {
      if (this.token.allowTransfer) {
        const result = await this.token.allowTransfer(teamWallet, teamLockfreeTokens - 1);
        result.should.be.equal(true);

        const result2 = await this.token.allowTransfer(teamWallet, 1);
        result2.should.be.equal(true);
      }
    })

    // it('should accept if locked accounts transfer after teamLockPeriod', async function() {
    //   if (this.token.allowTransfer) {
    //     const result = await this.token.allowTransfer(teamWallet, teamLockfreeTokens + 1);
    //     result.should.be.equal(false);
        
    //     await this.token.lockedTransfer(purchaseTester, 600, { from: teamWallet }).should.be.fulfilled;
    //     const result2 = await this.token.allowTransfer(purchaseTester, 1);
    //     result2.should.be.equal(false);

    //     await increaseTimeTo(this.afterTeamLockEndTime + duration.days(1 * 30));
    //     await this.token.release({ from: purchaseTester });
    //     const result3 = await this.token.allowTransfer(teamWallet, 600 * duration.days(1 * 30) / teamVestedPeriod);
    //     result3.should.be.equal(true);
    //   }
    // })

  })

  describe('transfer', function () {

    it('should reject/resume if the contract is pause/unpause', async function () {
      const owner = await this.token.owner();

      await this.token.transfer(owner, 1, { from: owner }).should.be.fulfilled;
      
      await this.token.pause({ from: owner });
      await this.token.transfer(owner, 1, { from: owner }).should.be.rejectedWith(EVMRevert);

      await this.token.unpause({ from: owner });
      await this.token.transfer(owner, 1, { from: owner }).should.be.fulfilled;
    })

    // it('should reject transfer from a locked account within teamLockPeriod', async function() {
    //   await this.token.transfer(purchaseTester, teamLockfreeTokens + 1, { from: teamWallet }).should.be.rejectedWith(EVMRevert);
    // })

    // it('should accept transfer from a locked account after teamLockPeriod', async function() {
    //   await this.token.lockedTransfer(purchaseTester, 1, { from: teamWallet }).should.be.fulfilled;
    //   await this.token.transfer(teamWallet, 1, { from: purchaseTester }).should.be.rejectedWith(EVMRevert);
      
    //   await increaseTimeTo(this.afterTeamLockEndTime + duration.years(1));
    //   await this.token.transfer(teamWallet, 1, { from: purchaseTester }).should.be.fulfilled;
    // })

    // it('should accept transfer from unlocked account', async function() {
    //   await this.token.transfer(purchaseTester, 1, { from: fundsWallet }).should.be.fulfilled;
    // })

    // it('should accept if teamWallet can transfer newly received tokens', async function () {
    //   if (this.token.allowTransfer) {
    //     const owner = await this.token.owner();
    //     const result = await this.token.allowTransfer(teamWallet, teamLockfreeTokens);
    //     result.should.be.equal(true);

    //     await this.token.lockedTransfer(purchaseTester, teamTokens, { from: teamWallet }).should.be.fulfilled;
    //     await this.token.transfer(teamWallet, 1, { from: owner }).should.be.fulfilled;
    //     const result2 = await this.token.allowTransfer(teamWallet, 1);
    //     result2.should.be.equal(true);
    //   }
    // })

  })

  // describe('lockedTransfer', function() {

  //   it('should reject if sender is not teamWallet', async function () {
  //     if (this.token.lockedTransfer) {
  //       await this.token.lockedTransfer(fundsWallet, 1, { from: fundsWallet }).should.be.rejectedWith(EVMRevert);
  //       await this.token.lockedTransfer(foundationWallet, 1, { from: foundationWallet }).should.be.rejectedWith(EVMRevert);
  //     }
  //   })

  //   it('should reject if send amount is 0', async function() {
  //     if (this.token.lockedTransfer) {
  //       await this.token.lockedTransfer(purchaseTester, 0, { from: teamWallet }).should.be.rejectedWith(EVMRevert);
  //     }
  //   })

  //   it('should reject if teamWallet do not have enough locked tokens', async function () {
  //     if (this.token.lockedTransfer) {
  //       await this.token.lockedTransfer(purchaseTester, teamTokens + teamLockfreeTokens * 2, { from: teamWallet }).should.be.rejectedWith(EVMRevert);
  //       await this.token.lockedTransfer(purchaseTester, teamTokens + teamLockfreeTokens, { from: teamWallet }).should.be.fulfilled;
  //       await this.token.lockedTransfer(purchaseTester, teamTokens, { from: teamWallet }).should.be.rejectedWith(EVMRevert);
  //     }
  //   })

  //   it('should reject if non teamWallet sends locked token', async function() {
  //     if (this.token.lockedTransfer) {
  //       await this.token.lockedTransfer(purchaseTester, 1, { from: teamWallet }).should.be.fulfilled;
  //       await this.token.lockedTransfer(teamWallet, 1, { from: purchaseTester }).should.be.rejectedWith(EVMRevert);
  //     }
  //   })

  //   it('should reject if to address has accepted lock transfer already', async function() {
  //     if (this.token.lockedTransfer) {
  //       await this.token.lockedTransfer(purchaseTester, 500, { from: teamWallet }).should.be.fulfilled;

  //       await this.token.lockedTransfer(purchaseTester, 500, { from: teamWallet }).should.be.rejectedWith(EVMRevert);
  //     }
  //   })

  //   it('should accept if transfer success', async function () {
  //     if (this.token.lockedTransfer) {
  //       await this.token.lockedTransfer(purchaseTester, teamTokens, { from: teamWallet }).should.be.fulfilled;

  //       const testerBalance = await this.token.balanceOf(purchaseTester);
  //       testerBalance.should.be.bignumber.equal(teamTokens);
  //     }
  //   })

  //   it('should log LockTransfer event', async function() {
  //     const sendAmount = 100;
  //     const { logs } = await this.token.lockedTransfer(purchaseTester, sendAmount, { from: teamWallet });

  //     const LockTransferEvent = logs.find(e => e.event === 'LockTransfer');

  //     should.exist(LockTransferEvent);
  //     LockTransferEvent.args.from.should.equal(teamWallet);
  //     LockTransferEvent.args.to.should.be.bignumber.equal(purchaseTester);
  //     LockTransferEvent.args.amount.should.be.bignumber.equal(sendAmount);
  //     // LockTransferEvent.args.endTime.should.be.bignumber.equal(this.startTime + teamLockPeriod);
  //   })
  // })

  describe('vestedTransfer', function() {

    it('should reject if sender is not fundsWallet', async function() {
      if (this.token.vestedTransfer) {
        await this.token.vestedTransfer(purchaseTester, teamTokens, minVestLockMonths, { from: teamWallet }).should.be.rejectedWith(EVMRevert);
      }
    })

    it('should reject if _lockMonths is smaller than the minVestLockMonths', async function() {
      if (this.token.vestedTransfer) {
        await this.token.vestedTransfer(purchaseTester, teamTokens, minVestLockMonths-1, { from: fundsWallet }).should.be.rejectedWith(EVMRevert);
      }
    })

    it('should reject if send amount is 0', async function() {
      if (this.token.vestedTransfer) {
        await this.token.vestedTransfer(purchaseTester, 0, minVestLockMonths, { from: fundsWallet }).should.be.rejectedWith(EVMRevert);
      }
    })

    it('should reject if ico is closed', async function() {
      if (this.token.vestedTransfer) {
        await this.token.vestedTransfer(purchaseTester, icoCap, minVestLockMonths, { from: fundsWallet }).should.be.fulfilled;
        await this.token.vestedTransfer(purchaseTester, 1, minVestLockMonths, { from: fundsWallet }).should.be.rejectedWith(EVMRevert);
      }
    })

    it('should reject if sender do not have enough tokens', async function() {
      if (this.token.vestedTransfer) {
        await this.token.vestedTransfer(purchaseTester, icoCap - 1, minVestLockMonths, { from: fundsWallet }).should.be.fulfilled;
        await this.token.vestedTransfer(purchaseTester, 1, minVestLockMonths, { from: fundsWallet }).should.be.rejectedWith(EVMRevert);
      }
    })

    it('should accept if token distributions after vestedTransfer are correct', async function() {
      if (this.token.vestedTransfer) {
        const vestTokenAmount = 500;

        await this.token.vestedTransfer(purchaseTester, vestTokenAmount, minVestLockMonths, { from: fundsWallet }).should.be.fulfilled;
        const vestFreeAmount = await this.token.balanceOf(purchaseTester);
        vestFreeAmount.should.be.bignumber.equal(vestTokenAmount * (100 - icoVestedPercentage) / 100);
        
        const allocatedAmount = await this.token.allocationOf(purchaseTester);
        allocatedAmount.should.be.bignumber.equal(vestTokenAmount * icoVestedPercentage / 100);

        const fundsWalletBalance = await this.token.balanceOf(fundsWallet);
        fundsWalletBalance.should.be.bignumber.equal(icoCap - vestTokenAmount);
      }
    })

    it('should reject if to address has purchased already', async function() {
      if (this.token.vestedTransfer) {
        await this.token.vestedTransfer(purchaseTester, 500, 3, { from: fundsWallet }).should.be.fulfilled;

        await this.token.vestedTransfer(purchaseTester, 500, 3, { from: fundsWallet }).should.be.rejectedWith(EVMRevert);
      }
    })

    it('should log Transfer and VestTransfer event', async function() {
      const totalPurchaseToken = 100;
      const lockfreeTokenAmount = totalPurchaseToken * (100 - icoVestedPercentage) / 100;
      const vestTokenAmount = totalPurchaseToken * icoVestedPercentage / 100;
      
      const { logs } = await this.token.vestedTransfer(purchaseTester, totalPurchaseToken, minVestLockMonths, { from: fundsWallet });
      const TransferEvent = logs.find(e => e.event === 'Transfer');
      const VestTransferEvent = logs.find(e => e.event === 'VestTransfer');

      should.exist(TransferEvent);
      TransferEvent.args.from.should.equal(fundsWallet);
      TransferEvent.args.to.should.be.bignumber.equal(purchaseTester);
      TransferEvent.args.value.should.be.bignumber.equal(lockfreeTokenAmount);

      should.exist(VestTransferEvent);
      VestTransferEvent.args.from.should.equal(fundsWallet);
      VestTransferEvent.args.to.should.be.bignumber.equal(purchaseTester);
      VestTransferEvent.args.amount.should.be.bignumber.equal(vestTokenAmount);
      // VestTransferEvent.args.startTime.should.be.bignumber.equal();
      VestTransferEvent.args.lockMonths.should.be.bignumber.equal(minVestLockMonths);
    })

    it('should reject/resume if the contract is pause/unpause', async function () {
      const owner = await this.token.owner();

      await this.token.vestedTransfer(purchaseTester, 1, minVestLockMonths, { from: fundsWallet }).should.be.fulfilled;
      
      await this.token.pause({ from: owner });
      await this.token.vestedTransfer(purchaseTester2, 1, minVestLockMonths, { from: fundsWallet }).should.be.rejectedWith(EVMRevert);

      await this.token.unpause({ from: owner });
      await this.token.vestedTransfer(purchaseTester3, 1, minVestLockMonths, { from: fundsWallet }).should.be.fulfilled;
    })

  })

  describe('allocationOf', function () {

    it('should return 0 initially', async function () {
      const allocation = await this.token.allocationOf(purchaseTester);
      allocation.should.be.bignumber.equal(0);
    })

    it('should return 1 if after allocate 1 token', async function () {
      await this.token.vestedTransfer(purchaseTester, 1, 3, { from: fundsWallet});
      const allocation = await this.token.allocationOf(purchaseTester);
      allocation.should.be.bignumber.equal(1);
    })
  
  })

  describe('release', function () {

    it('should have no logs if releaseableAmount is <= 0', async function () {
      let result = await this.token.release({ from: fundsWallet });
      result.logs.length.should.be.equal(0);

      await increaseTimeTo(this.afterTeamVestLockEndTime);
      await this.token.release({ from: teamWallet });
      result = await this.token.release({ from: teamWallet });
      result.logs.length.should.be.equal(0);
    })
    
    // it('should have no logs if locked accounts try to release tokens within teamLockPeriod', async function() {
    //   let result = await this.token.release({ from: teamWallet });
    //   result.logs.length.should.be.equal(0);

    //   await this.token.lockedTransfer(purchaseTester, 100, { from: teamWallet }).should.be.fulfilled;
    //   result = await this.token.release({ from: purchaseTester });
    //   result.logs.length.should.be.equal(0);
    // })

    it('should update teamWallet balance after successfully releasing tokens', async function() {
      await increaseTimeTo(this.afterTeamVestLockEndTime);

      await this.token.release({ from: teamWallet });
      const teamWalletBalance = await this.token.balanceOf(teamWallet);
      teamWalletBalance.should.be.bignumber.equal(teamTokens + teamLockfreeTokens);
    })

    it('should update balance of locked accounts after release tokens', async function() {
      await increaseTimeTo(this.afterTeamVestLockEndTime);

      await this.token.release({ from: teamWallet });
      const teamWalletBalance = await this.token.balanceOf(teamWallet);
      teamWalletBalance.should.be.bignumber.equal(teamTokens + teamLockfreeTokens);
    })

    it('should log Release and Transfer event', async function () {
      await increaseTimeTo(this.afterTeamVestLockEndTime);

      const { logs } = await this.token.release({ from: teamWallet });

      const releaseEvent = logs.find(e => e.event === 'Release');
      const transferEvent = logs.find(e => e.event === 'Transfer');

      should.exist(releaseEvent);
      releaseEvent.args.to.should.equal(teamWallet);
      releaseEvent.args.amount.should.be.bignumber.equal(teamTokens);

      should.exist(transferEvent);
      transferEvent.args.from.should.equal(ZERO_ADDRESS);
      transferEvent.args.to.should.equal(teamWallet);
      transferEvent.args.value.should.be.bignumber.equal(teamTokens);
    })

  })

  describe('releasableAmount', function () {

    it('should return 0 if sender do not contain vesting', async function () {
      const releasableAmount = await this.token.releasableAmount(purchaseTester);
      releasableAmount.should.be.bignumber.equal(0);

      const releasableAmount2 = await this.token.releasableAmount(communityWallet);
      releasableAmount2.should.be.bignumber.equal(0);
    })

    it('should return 0 for teamWallet within teamLockPeriod', async function () {
      const releasableAmount = await this.token.releasableAmount(teamWallet);
      releasableAmount.should.be.bignumber.equal(0);
    })

    it(`should return 0 after a release`, async function () {
      await increaseTimeTo(this.afterTeamLockEndTime + duration.days(5 * 30));
      await this.token.release({ from: teamWallet });

      const releasableAmount = await this.token.releasableAmount(teamWallet);
      releasableAmount.should.be.bignumber.equal(0);
    })

    it(`should return correct releasable amount`, async function () {
      await increaseTimeTo(this.afterTeamLockEndTime + duration.days(3 * 30));
      const teamWalletBalance = await this.token.releasableAmount(teamWallet);
      teamWalletBalance.should.be.bignumber.equal(teamTokens * duration.days(3 * 30) / teamVestedPeriod);
      
      await this.token.release({ from: teamWallet });
      await increaseTimeTo(this.afterTeamLockEndTime + duration.days(6 * 30));
      const teamWalletBalance2 = await this.token.releasableAmount(teamWallet);
      teamWalletBalance2.should.be.bignumber.equal(teamTokens * duration.days(3 * 30) / teamVestedPeriod);
    })

  })

  describe('vestedAmount', function () {

    it('should return 0 if sender do not contain any vesting', async function () {
      const vestedAmount = await this.token.vestedAmount(purchaseTester);
      vestedAmount.should.be.bignumber.equal(0);

      const vestedAmount2 = await this.token.vestedAmount(communityWallet);
      vestedAmount2.should.be.bignumber.equal(0);
    })

    it('should return 0 for locked account if within teamLockPeriod', async function() {
      const vestedAmount = await this.token.vestedAmount(teamWallet);
      vestedAmount.should.be.bignumber.equal(0);
    })

    it('should return all allocation of purchaseTester after vested period', async function () {
      const allocation = 100;
      const now = latestTime();
      await increaseTimeTo(now);
      await this.token.vestedTransfer(purchaseTester, allocation, 8, { from: fundsWallet });
      const expectedVestedAmount = allocation * icoVestedPercentage / 100;

      await increaseTimeTo(now + duration.days(8 * 30 + 3));
      const vestedAmount = await this.token.vestedAmount(purchaseTester);
      vestedAmount.should.be.bignumber.equal(expectedVestedAmount);
    })
  
    it('should return correct vested amount of purchaseTester', async function () {
      const allocation = 100;
      const now = latestTime();
      await increaseTimeTo(now);
      await this.token.vestedTransfer(purchaseTester, allocation, 8, { from: fundsWallet });
      const expectedVestedAmount = Math.floor(((allocation * icoVestedPercentage / 100) * 7) / 8);
  
      await increaseTimeTo(now + duration.days(8 * 30 - 3));
      const vestedAmount = await this.token.vestedAmount(purchaseTester);
      vestedAmount.should.be.bignumber.equal(expectedVestedAmount);
    })
  
    // it('should return correct vested amount of teamWallet', async function () {
    //   const expectedVestedAmount = teamTokens / 6 * 3;
    //   await increaseTimeTo(this.afterTeamLockEndTime + duration.days(3 * 30));
    //   const vestedAmount = await this.token.vestedAmount(teamWallet);
    //   vestedAmount.should.be.bignumber.equal(expectedVestedAmount + teamLockfreeTokens);

    //   await increaseTimeTo(this.afterTeamVestLockEndTime);
    //   const vestedAmount2 = await this.token.vestedAmount(teamWallet);
    //   vestedAmount2.should.be.bignumber.equal(teamTokens + teamLockfreeTokens);
    // })

  })

})