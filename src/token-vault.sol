// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ReentrancyGuard} from '@openzeppelin/contracts/utils/ReentrancyGuard.sol';

contract TokenVault is ReentrancyGuard {

    uint256 public FEE_BPS = 300;
    uint256 constant BPS_DENOMINATOR = 10_000;
    uint256 constant public MAX_FEE_BPS = 1_000;
    bool internal pauseSwitch;

    uint256 public totalOwnersProfit;
    uint256 public totalDeposits;
    address public owner;

    mapping (address => uint256) public deposits;
    mapping (address => mapping (uint256 => depositInfo)) usersDeposits;
    mapping (address => uint256) depositCount;

    struct depositInfo {
        uint256 amount;
        uint256 time;
    }

    //errors
    error Unauthorized();
    error ZeroAmount();
    error NotEnoughBalance();
    error TimeNotReached();
    error ZeroDate();
    error DepositsPaused();
    error ExceedsFeeCap();

    //events
    event deposited(address indexed depositer, uint256 indexed amount, uint indexed id);
    event withdrawn(address indexed withdrawer, uint256 indexed amount, uint indexed id);
    event emergencyWithdrawn(address indexed withdrawer);
    event feeChanged(uint256 oldfee, uint256 newerFee);

    constructor () {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if(msg.sender != owner) {revert Unauthorized();}
        _;
    }

    function deposit(uint256 timeInDays) public payable returns(bool, uint256) {
       
        uint amount = msg.value;

        if(amount == 0) { revert ZeroAmount();}

        if(timeInDays == 0) {revert ZeroDate();}

        if(pauseSwitch == true) {revert DepositsPaused();}

        uint256 id = depositCount[msg.sender]++;
        uint256 numberOfDays = block.timestamp + timeInDays * 1 days;

        deposits[msg.sender] += amount;
        usersDeposits[msg.sender][id] = depositInfo({amount: msg.value, time: numberOfDays});
        totalDeposits += amount;

        emit deposited(msg.sender, amount, id);

        return (true, amount);


    }

    function seeBalance(uint256 _id) public view returns(depositInfo memory) {
        depositInfo memory depositPosition = usersDeposits[msg.sender][_id];
   
        return depositPosition;
    }

    function getDepositsOf(address user) public view returns (uint256[] memory ids, depositInfo[] memory infos) {

        uint256 total = depositCount[user];

        uint256 active;
        for (uint256 i = 0; i < total; i++) {
            if (usersDeposits[user][i].amount > 0) active++;
        }

        ids = new uint256[](active);
        infos = new depositInfo[](active);
        uint256 j;
        for (uint256 i = 0; i < total; i++) {
            depositInfo memory d = usersDeposits[user][i];
            if (d.amount > 0) {
                ids[j] = i;
                infos[j] = d;
                j++;
            }
        }

        return (ids, infos);
    }

    function withdraw(uint256 amount, uint256 _id) public nonReentrant {

        depositInfo storage user = usersDeposits[msg.sender][_id];

        if( amount > user.amount) {
            revert NotEnoughBalance();
        }

        if(block.timestamp < user.time) {
            revert TimeNotReached();
        }

        if(amount == 0 ) {revert ZeroAmount();}


        deposits[msg.sender] -= amount;
        totalDeposits -= amount;
        user.amount -= amount;

        (bool success, ) = payable(msg.sender).call{value: amount}('');

        require(success, 'withdraw failed');

        emit withdrawn(msg.sender, amount, _id);
    }

    // clean users balance
    function emergencyWithdrawal(uint256 _id) public nonReentrant {

        depositInfo storage d = usersDeposits[msg.sender][_id];
       

        if(d.amount == 0) {revert ZeroAmount();}

        uint256 ownersProfit = d.amount * FEE_BPS / BPS_DENOMINATOR;

        totalOwnersProfit += ownersProfit;

        uint256 balance = d.amount - ownersProfit;


        deposits[msg.sender] -= d.amount;
        totalDeposits -= d.amount;
        d.amount = 0;

        (bool success, ) = payable(msg.sender).call{value: balance}('');

        require(success, 'Withdraw failed');     

        emit emergencyWithdrawn(msg.sender); 
    }

    function withdrawOwnersProfit() public onlyOwner nonReentrant {

        uint256 profit = totalOwnersProfit;

        if(profit == 0) {revert ZeroAmount();}

        totalOwnersProfit = 0;

        (bool success, ) = payable(msg.sender).call{value: profit}('');

        require(success, 'transfer failed');

    }

    function pauseDeposits() public onlyOwner {
        pauseSwitch = !pauseSwitch;
    }

    function changeFee(uint256 newFee) public onlyOwner returns(uint, uint) {
        if (newFee > MAX_FEE_BPS) {revert ExceedsFeeCap();}

        uint256 oldFee = FEE_BPS / BPS_DENOMINATOR;

        FEE_BPS = newFee;

        uint newerFee = FEE_BPS / BPS_DENOMINATOR;

        emit feeChanged( oldFee, newerFee);

        return (oldFee, newerFee);
    }


    
}