// solhint-disable func-name-mixedcase
interface ILaunchBridge {
    function DAI() external view returns (address);
    function LIDO() external view returns (address);
    function USDC() external view returns (address);
    function balanceOf(address user) external view returns (uint256 ethBalance, uint256 usdBalance);
    function depositDAI(uint256 daiAmount) external;
    function depositStETH(uint256 stETHAmount) external;
    function depositUSDC(uint256 usdcAmount) external;
    function depositETH() external payable;
    function emergencyWithdraw() external;
    function ethShares(address) external view returns (uint256);
    function getMainnetBridge() external view returns (address mainnetBridge);
    function totalETHBalance() external view returns (uint256);
    function totalETHShares() external view returns (uint256);
    function totalUSDBalanceNoUpdate() external view returns (uint256);
    function totalUSDShares() external view returns (uint256);
    function transition() external;
    function transitioned(address) external view returns (bool);
    function usdShares(address) external view returns (uint256);
    function withdrawAndLosePoints() external;
}
