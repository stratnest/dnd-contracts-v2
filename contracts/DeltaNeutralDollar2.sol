/* solhint-disable no-inline-assembly */
pragma solidity ^0.8.23;

import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { ERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { SignedMath } from "@openzeppelin/contracts/utils/math/SignedMath.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import { IVault, IERC20 } from "@balancer-labs/v2-interfaces/contracts/vault/IVault.sol";
import { IFlashLoanRecipient } from "@balancer-labs/v2-interfaces/contracts/vault/IFlashLoanRecipient.sol";

import { IPool } from "@aave/core-v3/contracts/interfaces/IPool.sol";
import { IAaveOracle } from "@aave/core-v3/contracts/interfaces/IAaveOracle.sol";
import { IPoolAddressesProvider } from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import { IPoolDataProvider } from "@aave/core-v3/contracts/interfaces/IPoolDataProvider.sol";
import { DataTypes } from "@aave/core-v3/contracts/protocol/libraries/types/DataTypes.sol";

import { ISwapHelper } from "./ISwapHelper.sol";

import "hardhat/console.sol";

uint256 constant AAVE_INTEREST_RATE_MODE_VARIABLE = 2;

uint8 constant FLASH_LOAN_MODE_CLOSE_POSITION = 3;
uint8 constant FLASH_LOAN_MODE_REBALANCE_SUPPLY_AND_BORROW = 4;
uint8 constant FLASH_LOAN_MODE_REBALANCE_REPAY_THEN_WITHDRAW = 5;

uint8 constant FLAGS_POSITION_CLOSED   = 1 << 0;
uint8 constant FLAGS_DEPOSIT_PAUSED    = 1 << 1;
uint8 constant FLAGS_WITHDRAW_PAUSED   = 1 << 2;

uint256 constant EXTRACT_LTV_FROM_POOL_CONFIGURATION_DATA_MASK = (1 << 16) - 1;

uint256 constant MIN_DND_AMOUNT_TO_WITHDRAW = 10 ** 8; // roughly one dollar

string constant ERROR_OPERATION_DISABLED_BY_FLAGS = "DND-01";
string constant ERROR_ONLY_FLASHLOAN_LENDER = "DND-02";
string constant ERROR_INCORRECT_FLASHLOAN_TOKEN_RECEIVED = "DND-03";
string constant ERROR_UNKNOWN_FLASHLOAN_MODE = "DND-04";
string constant ERROR_INCORRECT_DEPOSIT_OR_WITHDRAWAL_AMOUNT = "DND-05";
string constant ERROR_CONTRACT_NOT_READY_FOR_WITHDRAWAL = "DND-06";
string constant ERROR_POSITION_CLOSED = "DND-07";
string constant ERROR_POSITION_UNCHANGED = "DND-08";
string constant ERROR_IMPOSSIBLE_MODE = "DND-09";

/// @title Delta-neutral dollar vault

contract DeltaNeutralDollar2 is IFlashLoanRecipient, ERC20Upgradeable, OwnableUpgradeable, UUPSUpgradeable {
    /// @notice Settings are documented in the code
    struct Settings {
        /// @notice Address of the contract that implements asset swapping functionality.
        address swapHelper;

        /// @notice The minimum amount of `mainToken` to deposit.
        uint256 minDepositAmount;

        /// @notice The maximum amount of `mainToken` to deposit.
        uint256 maxDepositAmount;

        /// @notice The desirable distance to the LTV utilized when calculating position size.
        /// This is typically set to around 1%, i.e., if Aave's LTV is 80%, we aim to maintain our position at 79%.
        /// Note that this value needs to be multiplied by a factor of 100. For instance, "250" stands for 2.5%.
        uint8 additionalLtvDistancePercent;

        /// @notice Binary settings for the smart contract, as specified by the FLAGS_* constants.
        uint8 flags;

        /// @notice The minimum threshold of debt or collateral difference between the current position and the
        /// ideal calculated position that triggers an execution. Changes below this are disregarded.
        /// Note that this value is set as a percentage and needs to be multiplied by 10. Therefore, "10" equates to 1%.
        uint8 minRebalancePercent;

        // 8 bit left here
    }

    /// @notice actual contract settings
    Settings public settings;

    IPoolAddressesProvider private aaveAddressProvider;

    IVault private balancerVault; // FIXME remove types?

    IPool private pool;
    IAaveOracle private oracle;

    /// @notice Address of the stable token used as collateral in Aave by this contract.
    IERC20 public stableToken;

    /// @notice Address of the main ERC-20 token accepted by this contract. Usually it is a staked ETH.
    IERC20 public mainToken;

    uint8 private _decimals;

    uint8 private stableTokenDecimals;
    uint8 private mainTokenDecimals;
    // 8 bits left here

    /// @notice Event triggered post-execution of position change by deposit, withdrawal or direct execution of the `rebalance()` function.
    /// @param mainBalance Post-rebalance balance of `mainToken`
    /// @param totalCollateralBase Aggregate collateral in Aave's base currency
    /// @param totalDebtBase Aggregate debt in Aave's base currency
    /// @param collateralChangeBase Net collateral change post-rebalance.
    /// Negative value implies collateral withdrawal, positive value implies collateral deposit.
    /// @param debtChangeBase Net debt change post-rebalance.
    /// Negative value indicates debt repayment, positive value indicates additional borrowing.
    event PositionChange(uint256 mainBalance, uint256 totalCollateralBase, uint256 totalDebtBase, int256 collateralChangeBase, int256 debtChangeBase);

    /// @notice Emitted after a position has been closed
    /// @param finalMainBalance The final balance in `mainToken` after closing the position
    event PositionClose(uint256 finalMainBalance);

    /// @notice This event is emitted when a withdrawal takes place
    /// @param amount The DND withdrawal amount requested by user
    /// @param amountBase The amount that has been withdrawn denoted in Aave's base currency. This is for reference only
    /// as no actual transfers of Aave base currency ever happens
    /// @param amountMain The actual amnount of `mainToken` that has been withdrawn from the position
    event PositionWithdraw(uint256 amount, uint256 amountBase, uint256 amountMain, address user);

    /// @notice This event is emitted when a deposit takes place
    /// @param amount The amount of that token user deposited
    /// @param amountBase The amount that has been deposited denoted in Aave's base currency. This is for reference only
    /// as no actual transfers of Aave base currency ever happens
    /// @param amount The actual amnount of `mainToken` that has been deposited into the position
    event PositionDeposit(uint256 amount, uint256 amountBase, address user);

    /// @notice Actual constructor of this upgradeable contract
    /// @param __decimals `decimals` for this contract's ERC20 properties. Should be equal to Aave base currency decimals, which is 8.
    /// @param symbol `symbol` for this contract's ERC20 properties. Typically it's DND.
    /// @param name `name` for this contract's ERC20 properties.
    /// @param _stableToken Address of the stable token used as collateral in Aave by this contract.
    /// @param _mainToken Address of the ERC-20 token accepted by this contract. Usually it is a staked ETH.
    /// @param _balancerVault The contract address of the Balancer's Vault, necessary for executing flash loans.
    /// @param _aaveAddressProvider The address of the Aave's ADDRESS_PROVIDER.
    /// @param _settings Actual settings. See `Settings` structure in code.
    function initialize(
        uint8 __decimals,
        string memory symbol,
        string memory name,
        address _stableToken,
        address _mainToken,
        address _balancerVault,
        address _aaveAddressProvider,
        Settings calldata _settings
    )
        public
        initializer
    {
        __ERC20_init(name, symbol);
        // __Ownable_init(); // FIXME why not needed?

        _decimals = __decimals;

        aaveAddressProvider = IPoolAddressesProvider(_aaveAddressProvider);

        pool = IPool(aaveAddressProvider.getPool());
        oracle = IAaveOracle(aaveAddressProvider.getPriceOracle());

        settings = _settings;

        balancerVault = IVault(_balancerVault);

        mainToken = IERC20(_mainToken);
        stableToken = IERC20(_stableToken);

        stableToken.approve(settings.swapHelper, 2 ** 256 - 1);
        mainToken.approve(settings.swapHelper, 2 ** 256 - 1);
        console.log("Approved swap helper");

        mainTokenDecimals = IERC20Metadata(_mainToken).decimals();
        stableTokenDecimals = IERC20Metadata(_stableToken).decimals();

        mainToken.approve(address(pool), 2 ** 256 - 1);
        stableToken.approve(address(pool), 2 ** 256 - 1);

        _transferOwnership(msg.sender);
    }

    // FIXME move to custom errors

    function _authorizeUpgrade(address) internal override onlyOwner {}

    /// _notice Retrieves the contract's current implementation address
    /// _return The address of the active contract implementation
    // FIXME check upgradeability today
    // function implementation() public view returns (address) {
    //     return _getImplementation();
    // }

    modifier whenFlagNotSet(uint8 whatExactly) {
        require((settings.flags & whatExactly) != whatExactly, ERROR_OPERATION_DISABLED_BY_FLAGS);
        _;
    }

    modifier onlyBalancerVault() {
        require(msg.sender == address(balancerVault), ERROR_ONLY_FLASHLOAN_LENDER);
        _;
    }

    /// @notice Closes the entire position, repaying all debt, withdrawing all collateral from Aave and deactivating the contract.
    /// Only accessible by the contract owner when the position hasn't been already closed.
    function closePosition() public whenFlagNotSet(FLAGS_POSITION_CLOSED) onlyOwner {
        settings.flags = settings.flags | FLAGS_POSITION_CLOSED;

        (, , address variableDebtTokenAddress) = IPoolDataProvider(aaveAddressProvider.getPoolDataProvider()).getReserveTokensAddresses(address(mainToken));

        uint256 debtMain = IERC20(variableDebtTokenAddress).balanceOf(address(this));
        uint256 balanceMain = mainToken.balanceOf(address(this));

        if (balanceMain >= debtMain) { // even if debtMain and/or balanceMain == 0
            if (debtMain > 0) {
                debtRepay(type(uint256).max);
            }

            collateralWithdraw(type(uint).max);
            swap(stableToken, mainToken, stableToken.balanceOf(address(this)));

        } else {
            uint256 flashLoanMain = debtMain - balanceMain; // there is no underflow risk as it has been checked in the "if" above
            doFlashLoan(address(mainToken), flashLoanMain, abi.encode(FLASH_LOAN_MODE_CLOSE_POSITION));
        }

        uint256 balanceAfter = mainToken.balanceOf(address(this));

        // this weird trick is required to work around hardhat(?) bug emiting 0 in this event
        balanceAfter = balanceAfter + 1;

        emit PositionClose(balanceAfter - 1);
    }

    /// @notice Calculates the required changes in collateral and debt in Aave, given the current prices of `stableToken` and `mainToken`,
    /// total debt and collateral, and the amount of `mainToken` on balance.
    /// @return collateralChangeBase The amount by which the collateral should adjust.
    /// A negative value implies that collateral should be withdrawn; positive value indicates that more collateral is to be supplied.
    /// Note: amount is denoted in Aave base currency.
    /// @return debtChangeBase The amount by which the debt should adjust.
    /// A negative value indicates debt repayment should occur; positive value indicates that more debt should be borrowed.
    /// Note: amount is denoted in Aave base currency.
    /// @dev This is a public facing implementation, a read-only method to see if there's any change pending.
    function calculateRequiredPositionChange() public view returns (int256 collateralChangeBase, int256 debtChangeBase) {
        uint256 mainPrice = oracle.getAssetPrice(address(mainToken));
        (uint256 totalCollateralBase, uint256 totalDebtBase, , , , ) = pool.getUserAccountData(address(this));
        return _calculateRequiredPositionChange(totalCollateralBase, totalDebtBase, mainPrice);
    }

    function _calculateRequiredPositionChange(uint256 totalCollateralBase, uint256 totalDebtBase, uint256 mainPrice)
        internal
        view
        returns (
            int256 collateralChangeBase,
            int256 debtChangeBase
        )
    {
        uint256 balanceBase = convertMainToBase(mainToken.balanceOf(address(this)), mainPrice);
        uint256 totalAssetsBase = totalCollateralBase - totalDebtBase + balanceBase;

        // uint256 idealTotalCollateralBase = Math.mulDiv(totalAssetsBase, settings.positionSizePercent, 100); // FIXME remove once tested
        // uint256 idealTotalCollateralBase = Math.mulDiv(totalAssetsBase, 999, 1000); // shave 0.1% to give room

        uint256 idealTotalCollateralBase = totalAssetsBase;

        // positive means supply; negative: withdraw
        collateralChangeBase = SafeCast.toInt256(idealTotalCollateralBase) - SafeCast.toInt256(totalCollateralBase);

        uint256 collateralChangePercent = Math.mulDiv(SignedMath.abs(collateralChangeBase), 1000, idealTotalCollateralBase);
        if (collateralChangePercent < settings.minRebalancePercent) {
            collateralChangeBase = 0;
        }

        uint256 idealLtv = ltv() - (settings.additionalLtvDistancePercent * 10);
        uint256 idealTotalDebtBase = Math.mulDiv(idealTotalCollateralBase, idealLtv, 10000);

        // positive means borrow; negative: repay
        debtChangeBase = SafeCast.toInt256(idealTotalDebtBase) - SafeCast.toInt256(totalDebtBase);

        uint256 debtChangePercent = Math.mulDiv(SignedMath.abs(debtChangeBase), 1000, idealTotalDebtBase);
        if (debtChangePercent < settings.minRebalancePercent) {
            debtChangeBase = 0;
        }
    }

    /// @notice Do `calculateRequiredPositionChange()` and actually rebalance the position if changes are pending.
    /// This method reverts with `ERROR_POSITION_UNCHANGED` if the position stays the same or if the changes are too small
    /// and not worth executing.
    function rebalance() public {
        _rebalance(true);
    }

    function _rebalance(bool shouldRevert) internal {
        if (settings.flags & FLAGS_POSITION_CLOSED == FLAGS_POSITION_CLOSED) {
            if (shouldRevert) {
                revert(ERROR_POSITION_CLOSED);
            }

            return;
        }

        uint256 mainPrice = oracle.getAssetPrice(address(mainToken));

        (uint256 totalCollateralBase, uint256 totalDebtBase, , , , ) = pool.getUserAccountData(address(this));
        (int256 collateralChangeBase, int256 debtChangeBase) = _calculateRequiredPositionChange(totalCollateralBase, totalDebtBase, mainPrice);

        if (collateralChangeBase == 0 && debtChangeBase == 0) {
            if (shouldRevert) {
                revert(ERROR_POSITION_UNCHANGED);
            }

            return;
        }

        if (collateralChangeBase > 0 && debtChangeBase > 0) {
            // console.log("C00 ==> Supply collateral then borrow debt");
            implementSupplyThenBorrow(SignedMath.abs(collateralChangeBase), SignedMath.abs(debtChangeBase), mainPrice);

        } else if (collateralChangeBase < 0 && debtChangeBase < 0) {
            // console.log("C00 ==> Repay debt then withdraw collateral");
            implementRepayThenWithdraw(SignedMath.abs(collateralChangeBase), SignedMath.abs(debtChangeBase), mainPrice);

        } else if (collateralChangeBase > 0 && debtChangeBase < 0) {
            // console.log("C00 ==> Repay debt then supply collateral"); // not found yet
            implementRepay(SignedMath.abs(debtChangeBase), mainPrice);
            implementSupply(SignedMath.abs(collateralChangeBase), mainPrice);

        } else if (collateralChangeBase < 0 && debtChangeBase > 0) {
            // console.log("C00 ==> Borrow debt and withdraw collateral"); // not found yet
            implementWithdraw(SignedMath.abs(collateralChangeBase), oracle.getAssetPrice(address(stableToken)));
            implementBorrow(SignedMath.abs(debtChangeBase), mainPrice);

        } else if (collateralChangeBase == 0 && debtChangeBase > 0) {
            // console.log("C00 ==> Just borrow debt");
            implementBorrow(SignedMath.abs(debtChangeBase), mainPrice);

        } else if (collateralChangeBase == 0 && debtChangeBase < 0) {
            // console.log("C00 ==> Just repay debt");
            implementRepay(SignedMath.abs(debtChangeBase), mainPrice);

        } else if (collateralChangeBase < 0 && debtChangeBase == 0) {
            // console.log("C00 ==> Just withdraw collateral"); // not found yet
            implementWithdraw(SignedMath.abs(collateralChangeBase), oracle.getAssetPrice(address(stableToken)));

        } else if (collateralChangeBase > 0 && debtChangeBase == 0) {
            // console.log("C00 ==> Just supply collateral"); // not found yet
            implementSupply(SignedMath.abs(collateralChangeBase), mainPrice);

        } else {
            revert(ERROR_IMPOSSIBLE_MODE);
        }

        (totalCollateralBase, totalDebtBase, , , , ) = pool.getUserAccountData(address(this));

        emit PositionChange(
            mainToken.balanceOf(address(this)),
            totalCollateralBase,
            totalDebtBase,
            collateralChangeBase,
            debtChangeBase
        );
    }

    function implementSupply(uint256 supplyCollateralBase, uint256 mainPrice) internal {
        uint256 collateralMain = convertBaseToMain(supplyCollateralBase, mainPrice);
        uint256 collateralStable = swap(mainToken, stableToken, collateralMain);
        collateralSupply(collateralStable);
    }

    function implementBorrow(uint256 borrowDebtBase, uint256 mainPrice) internal {
        uint256 borrowMain = convertBaseToMain(borrowDebtBase, mainPrice);
        debtBorrow(borrowMain);
    }

    function implementRepayThenWithdraw(uint256 withdrawCollateralBase, uint256 repayDebtBase, uint256 mainPrice) internal {
        uint256 repayDebtMain = convertBaseToMain(repayDebtBase, mainPrice);

        uint256 myBalanceMain = mainToken.balanceOf(address(this));

        if (repayDebtMain <= myBalanceMain) {
            implementRepay(repayDebtBase, mainPrice);
            implementWithdraw(withdrawCollateralBase, oracle.getAssetPrice(address(stableToken)));
            return;
        }

        uint256 flashLoanMain = repayDebtMain - myBalanceMain;
        bytes memory userData = abi.encode(FLASH_LOAN_MODE_REBALANCE_REPAY_THEN_WITHDRAW, repayDebtMain, withdrawCollateralBase);
        doFlashLoan(address(mainToken), flashLoanMain, userData);
    }

    function implementSupplyThenBorrow(uint256 supplyCollateralBase, uint256 borrowDebtBase, uint256 mainPrice) internal {
        console.log("Supply collateral", supplyCollateralBase);
        console.log("      Borrow debt", borrowDebtBase);
        console.log("       Main price", mainPrice);

        uint256 supplyCollateralMain = convertBaseToMain(supplyCollateralBase, mainPrice);

        uint256 collateralMain = supplyCollateralMain / 5;

        // this actually cannot happen, because base currency in aave is 8 decimals and ether is 18, so smallest
        // aave amount is divisable by 5. But we keep this sanity check anyway.
        assert(collateralMain > 0);

        console.log("MainToken balance", mainToken.balanceOf(address(this)));
        console.log("Allowance", mainToken.allowance(address(this), address(settings.swapHelper)));

        uint256 collateralStable = swap(mainToken, stableToken, collateralMain);
        assert(collateralStable > 0);

        uint256 positionStable = collateralStable * 5;
        uint256 borrowDebtMain = convertBaseToMain(borrowDebtBase, mainPrice);

        bytes memory userData = abi.encode(FLASH_LOAN_MODE_REBALANCE_SUPPLY_AND_BORROW, borrowDebtMain, positionStable);

        uint256 flashLoanStable = collateralStable * 4;

        doFlashLoan(address(stableToken), flashLoanStable, userData);
    }

    function implementRepay(uint256 repayDebtBase, uint256 mainPrice) internal {
        debtRepay(convertBaseToMain(repayDebtBase, mainPrice));
    }

    function implementWithdraw(uint256 withdrawCollateralBase, uint256 stablePrice) internal {
        uint256 withdrawCollateralStable = convertBaseToStable(withdrawCollateralBase, stablePrice);
        assert(withdrawCollateralStable > 0);
        collateralWithdraw(withdrawCollateralStable);
        swap(stableToken, mainToken, withdrawCollateralStable);
    }

    function receiveFlashLoanRebalanceSupplyAndBorrow(uint256 flashLoanStable, uint256 positionStable, uint256 borrowDebtMain) internal {
        collateralSupply(positionStable);
        debtBorrow(borrowDebtMain);

        uint256 mainPrice = oracle.getAssetPrice(address(mainToken));
        uint256 stablePrice = oracle.getAssetPrice(address(stableToken));


        uint256 mainToSwap = convertBaseToMain(convertStableToBase(flashLoanStable, stablePrice), mainPrice);

        console.log("flash loan stable", flashLoanStable);
        console.log("mainToSwap", mainToSwap);

        uint256 feeMain = ISwapHelper(settings.swapHelper).calcSwapFee(address(mainToken), address(stableToken), mainToSwap);
        mainToSwap = mainToSwap + feeMain;

        console.log("mainToSwap", mainToSwap);

        console.log("stableToken before", stableToken.balanceOf(address(this)));

        // at this point we assume we always have enough main token to cover swap fees
        swap(mainToken, stableToken, mainToSwap);

        console.log("stableToken after ", stableToken.balanceOf(address(this)));

        assert(stableToken.balanceOf(address(this)) >= flashLoanStable);

        stableToken.transfer(address(balancerVault), flashLoanStable);

        uint256 dustStable = stableToken.balanceOf(address(this));
        if (dustStable > 0) {
            swap(stableToken, mainToken, dustStable);
        }
    }

    function receiveFlashLoanClosePosition(uint256 flashLoanMain) internal {
        // prior to that in closePosition() we have calculated that debt actually exists,
        // so it should NOT revert here with NO_DEBT_OF_SELECTED_TYPE
        debtRepay(type(uint256).max);

        collateralWithdraw(type(uint).max);

        swap(stableToken, mainToken, stableToken.balanceOf(address(this)));

        mainToken.transfer(address(balancerVault), flashLoanMain);
    }

    function receiveFlashLoanRepayThenWithdraw(uint256 flashLoanMain, uint256 repayDebtMain, uint256 withdrawCollateralBase) internal {
        debtRepay(repayDebtMain);

        uint256 withdrawCollateralStable = convertBaseToStable(withdrawCollateralBase, oracle.getAssetPrice(address(stableToken)));
        assert(withdrawCollateralStable > 0);

        collateralWithdraw(withdrawCollateralStable);

        swap(stableToken, mainToken, withdrawCollateralStable);

        mainToken.transfer(address(balancerVault), flashLoanMain);
    }

    function receiveFlashLoan(
        IERC20[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts, // solhint-disable-line no-unused-vars
        bytes memory userData
    )
        external
        onlyBalancerVault
    {
        (uint8 mode) = abi.decode(userData, (uint8));

        if (mode == FLASH_LOAN_MODE_REBALANCE_SUPPLY_AND_BORROW) {
            require(tokens.length == 1 && tokens[0] == stableToken, ERROR_INCORRECT_FLASHLOAN_TOKEN_RECEIVED);
            (, uint256 borrowDebtMain, uint256 positionStable) = abi.decode(userData, (uint8, uint256, uint256));
            receiveFlashLoanRebalanceSupplyAndBorrow(amounts[0], positionStable, borrowDebtMain);
            return;
        }

        if (mode == FLASH_LOAN_MODE_CLOSE_POSITION) {
            require(tokens.length == 1 && tokens[0] == mainToken, ERROR_INCORRECT_FLASHLOAN_TOKEN_RECEIVED);
            receiveFlashLoanClosePosition(amounts[0]);
            return;
        }

        if (mode == FLASH_LOAN_MODE_REBALANCE_REPAY_THEN_WITHDRAW) {
            require(tokens.length == 1 && tokens[0] == mainToken, ERROR_INCORRECT_FLASHLOAN_TOKEN_RECEIVED);
            (, uint256 repayDebtMain, uint256 withdrawCollateralBase) = abi.decode(userData, (uint8, uint256, uint256));
            receiveFlashLoanRepayThenWithdraw(amounts[0], repayDebtMain, withdrawCollateralBase);
            return;
        }

        revert(ERROR_UNKNOWN_FLASHLOAN_MODE);
    }

    /// @notice Allows the contract owner to recover misplaced tokens.
    /// The function can only be invoked by the contract owner.
    /// @param token An address of token contractfrom which tokens will be collected.
    /// @param to The recipient address where all retrieved tokens will be transferred.
    function rescue(address token, address to) public onlyOwner {
        // note: no zero-balance assertions or protections, we assume the owner knows what is he doing
        if (token == address(0)) {
            payable(to).transfer(address(this).balance);
            return;
        }

        IERC20(token).transfer(to, IERC20(token).balanceOf(address(this)));
    }

    /// @notice Deposit funds into vault
    /// @param amount amount of `token` to deposit
    /// @param onBehalfOf who to mint DND tokens to
    function deposit(uint256 amount, address onBehalfOf)
        public
        whenFlagNotSet(FLAGS_DEPOSIT_PAUSED)
        whenFlagNotSet(FLAGS_POSITION_CLOSED)
    {
        require(amount > 0, ERROR_INCORRECT_DEPOSIT_OR_WITHDRAWAL_AMOUNT);

        uint256 totalBalanceBaseBefore = totalBalanceBase();

        mainToken.transferFrom(msg.sender, address(this), amount);

        require(
            amount >= settings.minDepositAmount && amount <= settings.maxDepositAmount,
            ERROR_INCORRECT_DEPOSIT_OR_WITHDRAWAL_AMOUNT
        );

        _rebalance(false);

        uint256 totalBalanceBaseAfter = totalBalanceBase();

        if (totalSupply() == 0) {
            _mint(onBehalfOf, totalBalanceBaseAfter);
            emit PositionDeposit(amount, totalBalanceBaseAfter, onBehalfOf);
            return;
        }

        uint256 totalBalanceAddedPercent = Math.mulDiv(totalBalanceBaseAfter, 10e18, totalBalanceBaseBefore) - 10e18;

        uint256 minted = Math.mulDiv(totalSupply(), totalBalanceAddedPercent, 10e18);
        assert(minted > 0);

        _mint(onBehalfOf, minted);

        emit PositionDeposit(amount, totalBalanceBaseAfter - totalBalanceBaseBefore, onBehalfOf);
    }

    function _calculateMainWithdrawAmount(uint256 amount) internal view returns (uint256 amountMain, uint256 amountBase) {
        require(
            amount >= MIN_DND_AMOUNT_TO_WITHDRAW && amount <= balanceOf(msg.sender),
            ERROR_INCORRECT_DEPOSIT_OR_WITHDRAWAL_AMOUNT
        );

        uint256 percent = Math.mulDiv(amount, 10e18, totalSupply());
        assert(percent > 0);

        amountBase = Math.mulDiv(totalBalanceBase(), percent, 10e18);
        assert(amountBase > 0);

        uint256 mainPrice = oracle.getAssetPrice(address(mainToken));
        amountMain = convertBaseToMain(amountBase, mainPrice);
        assert(amountMain > 0);

        require(amountMain <= mainToken.balanceOf(address(this)), ERROR_CONTRACT_NOT_READY_FOR_WITHDRAWAL);
    }

    /// @notice Withdraw from vault
    /// @param amount The amount of DND to withdraw
    function withdraw(uint256 amount)
        public
        whenFlagNotSet(FLAGS_WITHDRAW_PAUSED)
    {
        (uint256 amountMain, uint256 amountBase) = _calculateMainWithdrawAmount(amount);
        _burn(msg.sender, amount);

        mainToken.transfer(msg.sender, amountMain);

        _rebalance(false);

        emit PositionWithdraw(amount, amountBase, amountMain, msg.sender);
    }

    /// @notice Returns the Total Value Locked (TVL) in the Vault
    /// @return The TVL represented in Aave's base currency
    function totalBalanceBase() public view returns (uint256) {
        (uint256 totalCollateralBase, uint256 totalDebtBase, , , ,) = pool.getUserAccountData(address(this));
        uint256 netBase = totalCollateralBase - totalDebtBase;

        uint256 mainPrice = oracle.getAssetPrice(address(mainToken));
        uint256 mainBalanceBase = Math.mulDiv(mainToken.balanceOf(address(this)), mainPrice, 10 ** mainTokenDecimals);

        return mainBalanceBase + netBase;
    }

    function debtBorrow(uint256 amount) internal {
        pool.borrow(address(mainToken), amount, AAVE_INTEREST_RATE_MODE_VARIABLE, 0, address(this));
    }

    function debtRepay(uint256 amount) internal {
        pool.repay(address(mainToken), amount, AAVE_INTEREST_RATE_MODE_VARIABLE, address(this));

        mainToken.transfer(address(pool), 0);
    }

    function collateralSupply(uint256 amount) internal {
        pool.supply(address(stableToken), amount, address(this), 0);
        pool.setUserUseReserveAsCollateral(address(stableToken), true);

        stableToken.transfer(address(pool), 0);
    }

    function collateralWithdraw(uint256 amount) internal {
        pool.withdraw(address(stableToken), amount, address(this));
    }

    function swap(IERC20 from, IERC20 to, uint256 amount) internal returns (uint256 swappedAmount) {
        swappedAmount = ISwapHelper(settings.swapHelper).swap(address(from), address(to), amount);
    }

    function doFlashLoan(address token, uint256 amount, bytes memory userData) internal {
        IERC20[] memory tokens = new IERC20[](1);
        tokens[0] = IERC20(token);

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;

        balancerVault.flashLoan(IFlashLoanRecipient(this), tokens, amounts, userData);
    }

    function convertBaseToStable(uint256 amount, uint256 stablePrice) internal view returns (uint256) {
        return Math.mulDiv(amount, 10 ** stableTokenDecimals, stablePrice);
    }

    function convertStableToBase(uint256 amount, uint256 stablePrice) internal view returns (uint256) {
        return Math.mulDiv(amount, stablePrice, 10 ** stableTokenDecimals);
    }

    function convertBaseToMain(uint256 amount, uint256 mainPrice) internal view returns (uint256) {
        return Math.mulDiv(amount, 10 ** mainTokenDecimals, mainPrice);
    }

    function convertMainToBase(uint256 amount, uint256 mainPrice) internal view returns (uint256) {
        return Math.mulDiv(amount, mainPrice, 10 ** mainTokenDecimals);
    }

    /*
    // those are not actually used, but kept in code for posterity

    function mainToStable(uint256 amount, uint256 mainPrice, uint256 stablePrice) internal view returns (uint256) {
        return amount * mainPrice / 10 ** (mainTokenDecimals - stableTokenDecimals) / stablePrice;
    }

    function stableToMain(uint256 amount, uint256 stablePrice, uint256 mainPrice) internal view returns (uint256) {
        return amount * stablePrice * 10 ** (mainTokenDecimals - stableTokenDecimals) / mainPrice;
    }
    */

    /// @notice Update contract's `settings`. Method is only available to owner.
    function setSettings(Settings calldata _settings)
        public
        onlyOwner
    {
        address oldSwaphelper = settings.swapHelper;
        settings = _settings;

        if (oldSwaphelper == settings.swapHelper) {
            return;
        }

        stableToken.approve(oldSwaphelper, 0);
        mainToken.approve(oldSwaphelper, 0);

        stableToken.approve(settings.swapHelper, 2 ** 256 - 1);
        mainToken.approve(settings.swapHelper, 2 ** 256 - 1);
    }

    function ltv() internal view returns (uint256) {
        DataTypes.ReserveConfigurationMap memory poolConfiguration = pool.getConfiguration(address(stableToken));
        return poolConfiguration.data & EXTRACT_LTV_FROM_POOL_CONFIGURATION_DATA_MASK;
    }

    /// @notice ERC20 method
    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }
}
