pragma solidity ^0.4.23;

import 'zeppelin-solidity/contracts/math/SafeMath.sol';
import 'zeppelin-solidity/contracts/token/ERC20/SafeERC20.sol';
import 'zeppelin-solidity/contracts/token/ERC20/PausableToken.sol';

contract EubChainIco is PausableToken {

  using SafeMath for uint;
  using SafeMath for uint256;
  using SafeERC20 for StandardToken;

  string public name = 'EubChain Token';
  string public symbol = 'EUBT';
  uint8 public decimals = 8;

  uint256 public totalSupply = 1000000000 * (uint256(10) ** decimals);

  uint public startTime; 

  uint256 public tokenSold = 0;

  uint8 private teamShare = 10;
  uint8 private teamExtraShare = 2;
  uint8 private communityShare = 10;
  uint8 private foundationShare = 10;
  uint8 private operationShare = 40;

  uint8 private icoShare = 30;
  uint256 private icoCap = totalSupply.mul(icoShare).div(100);

  uint256 private teamLockPeriod = 365 days;
  uint256 private minVestLockMonths = 3;

  address private fundsWallet;
  address private teamWallet;
  address private communityWallet;
  address private foundationWallet;

  struct Locking {
    uint256 amount;
    uint endTime;
  }
  struct Vesting {
    uint256 amount;
    uint startTime;
    uint lockMonths;
    uint256 released;
  }

  mapping (address => Locking) private lockingMap;
  mapping (address => Vesting) private vestingMap;

  event LockTransfer(
    address indexed from,
    address indexed to,
    uint256 amount,
    uint endTime
  );
  event VestTransfer(
    address indexed from,
    address indexed to,
    uint256 amount, 
    uint startTime, 
    uint lockMonths
  );
  event Release(address indexed to, uint256 amount);

  /*
    Contract constructor

    @param _fundsWallet - funding wallet address
    @param _teamWallet - team wallet address

    @return address of created contract
  */
  constructor () public {

    startTime = now;
    uint teamLockEndTime = startTime.add(teamLockPeriod);

    fundsWallet = 0x7b6Ab7E1d9bcdf4F2dBCA6613215CEF42067A987;
    teamWallet = 0x3353a85Ccfcf33FadcAa39d5F41F34a642acCbc4;
    communityWallet = 0xd52618eB19674705c50B950484f72032432E3B6E;
    foundationWallet = 0xD0EB153a535e758C76c6954e90Ec1C7648257063;

    uint256 teamTokens = totalSupply.mul(teamShare).div(100);
    uint256 teamExtraTokens = totalSupply.mul(teamExtraShare).div(100);
    uint256 communityTokens = totalSupply.mul(communityShare).div(100);
    uint256 foundationTokens = totalSupply.mul(foundationShare).div(100);
    uint256 operationTokens = totalSupply.mul(operationShare).div(100);

    Vesting storage teamVesting = vestingMap[teamWallet];
    teamVesting.amount = teamTokens;
    teamVesting.startTime = teamLockEndTime;
    teamVesting.lockMonths = 6;
    emit VestTransfer(0x0, teamWallet, teamTokens, teamLockEndTime, teamVesting.lockMonths);

    balances[communityWallet] = communityTokens;
    emit Transfer(0x0, communityWallet, communityTokens);
    balances[foundationWallet] = foundationTokens;
    emit Transfer(0x0, foundationWallet, foundationTokens);

    balances[communityWallet] = balances[communityWallet].sub(teamExtraTokens);
    balances[teamWallet] = balances[teamWallet].add(teamExtraTokens);
    emit Transfer(communityWallet, teamWallet, teamExtraTokens);
  
    uint256 restOfTokens = (
      totalSupply
        .sub(teamTokens)
        .sub(communityTokens)
        .sub(foundationTokens)
        .sub(operationTokens)
    );
    balances[fundsWallet] = restOfTokens;
    emit Transfer(0x0, fundsWallet, restOfTokens);
    
  }

  /*
    transfer vested tokens to receiver with lock period in months

    @param _to - address of token receiver 
    @param _amount - amount of token allocate 
    @param _lockMonths - number of months to vest

    @return true if the transfer is done
  */
  function vestedTransfer(address _to, uint256 _amount, uint _lockMonths) public whenNotPaused onlyPayloadSize(3 * 32) returns (bool) {
    require(
      msg.sender == fundsWallet ||
      msg.sender == teamWallet
    );
  
    require(_lockMonths >= minVestLockMonths);

    Vesting storage vesting = vestingMap[_to];
    require(vesting.amount == 0);

    if (msg.sender == fundsWallet) {
      require(allowPurchase(_amount));
      require(isPurchaseWithinCap(tokenSold, _amount));
    
      require(allowTransfer(msg.sender, _amount));

      uint256 transferAmount = _amount.mul(15).div(100);
      uint256 vestingAmount = _amount.sub(transferAmount);

      vesting.amount = vestingAmount;
      vesting.startTime = now;
      vesting.lockMonths = _lockMonths;

      emit VestTransfer(msg.sender, _to, vesting.amount, vesting.startTime, _lockMonths);

      balances[msg.sender] = balances[msg.sender].sub(_amount);
      tokenSold = tokenSold.add(_amount);

      balances[_to] = balances[_to].add(transferAmount);
      emit Transfer(msg.sender, _to, transferAmount);
    } else if (msg.sender == teamWallet) {
      Vesting storage teamVesting = vestingMap[teamWallet];

      require(now < teamVesting.startTime);
      require(
        teamVesting.amount.sub(teamVesting.released) > _amount
      );

      teamVesting.amount = teamVesting.amount.sub(_amount);

      vesting.amount = _amount;
      vesting.startTime = teamVesting.startTime;
      vesting.lockMonths = _lockMonths;

      emit VestTransfer(msg.sender, _to, vesting.amount, vesting.startTime, _lockMonths);
    }

    return true;
  }

  function isIcoOpen() public view returns (bool) {
    bool capReached = tokenSold >= icoCap;
    return !capReached;
  }

  /*
    check if purchase amount exists ico cap

    @param _tokenSold - amount of token sold 
    @param _purchaseAmount - amount of token want to purchase

    @return true if _purchaseAmount is allowed
  */
  function isPurchaseWithinCap(uint256 _tokenSold, uint256 _purchaseAmount) internal view returns(bool) {
    bool isLessThanCap = _tokenSold.add(_purchaseAmount) <= icoCap;
    return isLessThanCap;
  }

  /*
    @param _amount - amount of token
    @return true if the purchase is valid
  */
  function allowPurchase(uint256 _amount) internal view returns (bool) {
    bool nonZeroPurchase = _amount != 0;
    return nonZeroPurchase && isIcoOpen();
  }

  /*
    @param _wallet - wallet address of the token sender
    @param _amount - amount of token
    @return true if the transfer is valid
  */
  function allowTransfer(address _wallet, uint256 _amount) internal view returns (bool) {
    Locking memory locking = lockingMap[_wallet];
    if (locking.endTime > now) {
      return balances[_wallet].sub(_amount) >= locking.amount;
    } else {
      return balances[_wallet] >= _amount;
    }
  }

  /*
    transfer token from caller to receiver

    @param _to - wallet address of the token receiver
    @param _value - amount of token to be transferred

    @return true if the transfer is done
  */
  function transfer(address _to, uint256 _value) public onlyPayloadSize(2 * 32) returns (bool) {
    require(allowTransfer(msg.sender, _value));
    return super.transfer(_to, _value);
  }

  /*
    transfer token from sender to receiver 

    @param _from - wallet address of the token sender
    @param _to - wallet address of the token receiver
    @param _value - amount of token to be transferred

    @return true if the transfer is done
  */
  function transferFrom(address _from, address _to, uint256 _value)  onlyPayloadSize(3 * 32) public returns (bool) {
    require(allowTransfer(_from, _value));
    return super.transferFrom(_from, _to, _value);
  }

  /*
    @param _wallet - wallet address wanted to check
    @return amount of token allocated
  */
  function allocationOf(address _wallet) public view returns (uint256) {
    Vesting memory vesting = vestingMap[_wallet];
    return vesting.amount;
  }

  /*
    get the releasable tokens
    @return amount of released tokens
  */
  function release() public onlyPayloadSize(0 * 32) returns (uint256) {
    uint256 unreleased = releasableAmount(msg.sender);
    Vesting storage vesting = vestingMap[msg.sender];

    if (unreleased > 0) {
      vesting.released = vesting.released.add(unreleased);
      emit Release(msg.sender, unreleased);

      balances[msg.sender] = balances[msg.sender].add(unreleased);
      emit Transfer(0x0, msg.sender, unreleased);
    }

    return unreleased;
  }

  /*
    @param _wallet - wallet address wanted to check
    @return amount of releasable token
  */
  function releasableAmount(address _wallet) public view returns (uint256) {
    Vesting memory vesting = vestingMap[_wallet];
    return vestedAmount(_wallet).sub(vesting.released);
  }

  /*
    @param _wallet - wallet address wanted to check
    @return amount of vested token
  */
  function vestedAmount(address _wallet) public view returns (uint256) {
    uint amonth = 30 days;
    Vesting memory vesting = vestingMap[_wallet];
    uint lockPeriod = vesting.lockMonths.mul(amonth);
    uint lockEndTime = vesting.startTime.add(lockPeriod);

    if (now >= lockEndTime) {
      return vesting.amount;
    } else if (now > vesting.startTime) {
      
      uint roundedPeriod = now
        .sub(vesting.startTime)
        .div(amonth)
        .mul(amonth);

      return vesting.amount
        .mul(roundedPeriod)
        .div(lockPeriod);
    } else {
      return 0;
    }
  }

  /*
    modifiers to avoid short address attack
  */
  modifier onlyPayloadSize(uint size) {
    assert(msg.data.length == size + 4);
    _;
  } 
  
}