# PayableONFT — Contract Documentation

> **License:** MIT
> **Solidity:** `^0.8.28`

## Overview

**PayableONFT** is an ONFT721 with cross-chain minting via lightweight LayerZero messages, following a **Lazy Bridge Architecture**.

Mints always land on Origin. Users bridge to other chains on-demand via the standard ONFT `send()`.

### Cross-Chain Mint Flow

```
Remote: user pays ERC20 → sends 20-byte message (user address) to Origin
Origin: receives message → mints NFT to user's address on Origin
Later:  user bridges NFT wherever they want via send()
```

---

## Inheritance

| Contract | Source |
|----------|--------|
| `ONFT721` | `./layerzero/onft-evm/onft721/ONFT721.sol` |
| `Pausable` | `@openzeppelin/contracts/utils/Pausable.sol` |

## Imports

| Import | Path |
|--------|------|
| `ONFT721` | `./layerzero/onft-evm/onft721/ONFT721.sol` |
| `SendParam`, `MessagingFee`, `MessagingReceipt` | `./layerzero/onft-evm/onft721/interfaces/IONFT721.sol` |
| `IERC20` | `@openzeppelin/contracts/token/ERC20/IERC20.sol` |
| `Pausable` | `@openzeppelin/contracts/utils/Pausable.sol` |
| `Origin` | `./layerzero/lz-evm-protocol-v2/interfaces/ILayerZeroReceiver.sol` |
| `OptionsBuilder` | `./layerzero/oapp-evm/oapp/libs/OptionsBuilder.sol` |

---

## State Variables

| Variable | Type | Visibility | Modifier | Description |
|----------|------|------------|----------|-------------|
| `nextTokenId` | `uint256` | `public` | — | Auto-incrementing token ID counter |
| `mintPrice` | `uint256` | `public` | — | Price to mint one NFT (in payment token units) |
| `paymentToken` | `IERC20` | `public` | — | ERC20 token used for mint payments (default: USDC) |
| `originEid` | `uint32` | `public` | `immutable` | Origin Chain Endpoint ID where all tokens are minted |
| `MINT_GAS_LIMIT` | `uint128` | `public` | `constant` | Gas limit for executing a mint on Origin — just `_mint` + emit, no bridging back. Value: `100,000` |
| `MINT_MSG_TYPE` | `uint16` | `public` | `constant` | Custom message type for mint requests (distinct from ONFT `SEND=1`). Value: `3` |

---

## Events

| Event | Parameters | Description |
|-------|------------|-------------|
| `MintedAndPaid` | `address indexed user`, `uint256 tokenId`, `uint256 price` | Emitted when an NFT is minted and payment is collected |
| `CrossChainMintReceived` | `uint32 indexed srcEid`, `address indexed user`, `uint256 tokenId` | Emitted on Origin when a cross-chain mint request is fulfilled |
| `MintPriceUpdated` | `uint256 oldPrice`, `uint256 newPrice` | Emitted when the mint price is changed by admin |
| `PaymentTokenUpdated` | `address oldToken`, `address newToken` | Emitted when the payment token is changed by admin |

---

## Constructor

```solidity
constructor(
    string memory _name,
    string memory _symbol,
    address _lzEndpoint,
    address _delegate,
    address _paymentToken,
    uint32 _originEid
)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `_name` | `string` | NFT collection name |
| `_symbol` | `string` | NFT collection symbol |
| `_lzEndpoint` | `address` | LayerZero endpoint address |
| `_delegate` | `address` | Delegate address for ONFT721 |
| `_paymentToken` | `address` | ERC20 payment token address (e.g. USDC) |
| `_originEid` | `uint32` | Origin chain endpoint ID |

**Defaults:** `nextTokenId = 1`, `mintPrice = 10 USDC` (10 × 10⁶)

---

## Functions

### Minting

#### `mint(bytes calldata _extraOptions)`

> Mint an NFT. On Origin → local mint. On Remote → sends LZ message to Origin.

| Attribute | Value |
|-----------|-------|
| Visibility | `external` |
| Mutability | `payable` |
| Modifier | `whenNotPaused` |

| Parameter | Type | Description |
|-----------|------|-------------|
| `_extraOptions` | `bytes calldata` | Additional LayerZero options (pass `0x` for defaults) |

**Behavior:**
- If on Origin chain → calls `_payAndMintLocal(msg.sender)`
- If on Remote chain → calls `_requestMint(_extraOptions)`

---

#### `quoteMint(bytes calldata _extraOptions) → MessagingFee`

> Quote the LZ fee for a cross-chain mint request.

| Attribute | Value |
|-----------|-------|
| Visibility | `external` |
| Mutability | `view` |

| Parameter | Type | Description |
|-----------|------|-------------|
| `_extraOptions` | `bytes calldata` | LayerZero options |

**Returns:** `MessagingFee` — the estimated messaging fee. Returns `(0, 0)` if already on Origin.

---

#### `quoteBridge(uint32 _dstEid, bytes calldata _extraOptions) → MessagingFee`

> Quote the LZ fee for bridging an NFT to a destination chain.

| Attribute | Value |
|-----------|-------|
| Visibility | `external` |
| Mutability | `view` |

| Parameter | Type | Description |
|-----------|------|-------------|
| `_dstEid` | `uint32` | The destination endpoint ID |
| `_extraOptions` | `bytes calldata` | LayerZero execution options |

**Returns:** `MessagingFee` — the estimated fee for bridging.

---

### Internal — Minting

#### `_payAndMintLocal(address _to) → uint256`

> Pay ERC20 and mint locally (Origin chain only).

Transfers `mintPrice` from `msg.sender` via `transferFrom`, then calls `_mintInternal`. Reverts with `"Payment failed"` if the ERC20 transfer fails.

---

#### `_mintInternal(address _to) → uint256`

> Core mint logic.

Increments `nextTokenId`, mints the token to `_to`, and emits `MintedAndPaid`.

---

#### `_requestMint(bytes calldata _extraOptions)`

> Send a lightweight cross-chain mint request to Origin.

Message is just 20 bytes (the user's address) — no ONFT721 codec overhead. No NativeDrop needed since there's no return trip.

**Steps:**
1. Pay ERC20 locally
2. Build minimal message: just the requester's address
3. Build options — just gas for minting, no NativeDrop
4. Quote the fee
5. Send lightweight message to Origin via `_lzSend`

Reverts with `"Insufficient native fee"` if `msg.value < fee.nativeFee`.

---

### LZ Receive Override

#### `_lzReceive(Origin calldata, bytes32, bytes calldata, address, bytes calldata)`

> Override `_lzReceive` to handle both mint requests and standard ONFT bridges.

**Message discrimination by length:**

| Message Length | Type | Action |
|----------------|------|--------|
| **20 bytes** | Mint request (`abi.encodePacked(address)`) | Decode user address → `_mintInternal(user)` → emit `CrossChainMintReceived` |
| **64+ bytes** | Standard ONFT721 bridge (`bytes32 to + uint256 tokenId + ...`) | Delegate to `super._lzReceive(...)` |

---

### ONFT Bridge Helpers

#### `_encodeONFTMsg(bytes32 _to, uint256 _tokenId) → (bytes, bool)`

> Encode an ONFT721-compatible message (used for quoting bridges).

Returns `abi.encodePacked(_to, _tokenId)` and `hasCompose = false`.

---

### Admin

All admin functions are restricted to `onlyOwner`.

#### `withdrawTokens()`

> Withdraw collected payment tokens to the owner address.

Transfers the entire contract balance of `paymentToken` to `owner()`.

---

#### `setPaymentToken(address _token)`

> Update the ERC20 payment token used for minting.

Reverts with `"Invalid token address"` if `_token` is the zero address. Emits `PaymentTokenUpdated`.

---

#### `setMintPrice(uint256 _newPrice, uint8 _decimals)`

> Update mint price.

| Parameter | Type | Description |
|-----------|------|-------------|
| `_newPrice` | `uint256` | The price in whole units (e.g. `10` for 10 USDC) |
| `_decimals` | `uint8` | The token decimals (e.g. `6` for USDC) |

Stores `_newPrice * 10 ** _decimals` as the raw price. Reverts with `"Price must be > 0"` if price is zero. Emits `MintPriceUpdated`.

---

#### `pause()` / `unpause()`

> Pause / unpause minting (emergency stop).

Toggles the `Pausable` state, affecting the `whenNotPaused` modifier on `mint()`.

---

### Internal Override

#### `_payNative(uint256 _nativeFee) → uint256`

> Override `_payNative` to allow excess native gas (refunded by endpoint).

Reverts with `NotEnoughNative(msg.value)` if `msg.value < _nativeFee`.

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                        Remote Chain                          │
│                                                              │
│  User calls mint()                                           │
│       │                                                      │
│       ├─ ERC20 payment collected locally                     │
│       │                                                      │
│       └─ 20-byte LZ message (user address) ──────────────┐   │
│                                                           │   │
└───────────────────────────────────────────────────────────┼───┘
                                                            │
                        LayerZero Protocol                  │
                                                            │
┌───────────────────────────────────────────────────────────┼───┐
│                        Origin Chain                       │   │
│                                                           ▼   │
│  _lzReceive() detects 20-byte message                         │
│       │                                                       │
│       └─ _mintInternal(user) → NFT minted on Origin           │
│                                                               │
│  Later: user calls send() to bridge NFT anywhere              │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```
