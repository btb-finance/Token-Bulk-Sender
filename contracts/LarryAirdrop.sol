// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract LarryAirdrop is Ownable {
    IERC20 public larryToken;
    uint256 public constant AIRDROP_AMOUNT = 1000000000 * 10**18; // 1 billion tokens

    event AirdropProcessed(address[] recipients, uint256 amount);
    event TokensRecovered(address token, uint256 amount);

    constructor(address _larryToken) Ownable(msg.sender) {
        larryToken = IERC20(_larryToken);
    }

    /**
     * @dev Processes airdrop for multiple recipients
     * @param _recipients Array of recipient addresses
     */
    function airdropTokens(address[] calldata _recipients) external onlyOwner {
        require(_recipients.length <= 300, "Max 300 recipients per batch");
        uint256 totalAmount = AIRDROP_AMOUNT * _recipients.length;
        require(larryToken.balanceOf(address(this)) >= totalAmount, "Insufficient token balance");

        for (uint256 i = 0; i < _recipients.length; i++) {
            require(_recipients[i] != address(0), "Invalid recipient address");
            larryToken.transfer(_recipients[i], AIRDROP_AMOUNT);
        }

        emit AirdropProcessed(_recipients, AIRDROP_AMOUNT);
    }

    /**
     * @dev Recovers any ERC20 tokens sent to the contract
     * @param _token Address of the token to recover
     */
    function recoverTokens(address _token) external onlyOwner {
        IERC20 token = IERC20(_token);
        uint256 balance = token.balanceOf(address(this));
        require(balance > 0, "No tokens to recover");
        token.transfer(owner(), balance);
        emit TokensRecovered(_token, balance);
    }
}
