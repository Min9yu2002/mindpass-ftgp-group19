# MindPass

FTGP group project repository for MindPass MVP.

## Team
- Mingyu Wang
- Zhengchi Zhang
- Haizhi Jiang
- Haoyuan Wu

## Project Summary
MindPass is a privacy-preserving DApp prototype for mental-health record proof and access control. Sensitive records are stored off-chain in encrypted form, while hashes and permission logic are managed on-chain.

## Current MVP Scope
- Upload encrypted record off-chain
- Store record hash on-chain
- Grant access to therapist wallet
- Revoke future access
- Verify record integrity

## Repository Structure
- docs/: project documents and planning notes
- slides/: presentation drafts and slide materials
- contracts/: smart contract files and deployment notes
- frontend/: website or DApp frontend files
- meeting-notes/: meeting records and task allocations


Repository setup completed locally.
---

## 📅 Dev Log: 2026-03-17

- **UI Architecture**: Finalized the **Liquid Glass** design system. Successfully implemented the Patient Dashboard and Therapist Portal.
- **Chat Logic**: Built a secure P2P chat interface featuring a 50-min session timer, a 10-min warning modal, and a simulated dual-signature escrow release flow.
- **Backend (Supabase)**:
    - Designed and deployed DB Schema: `patients`, `therapists`, `sessions`, and `redeem_codes`.
    - Integrated API routes for dynamic therapist discovery and secure support code redemption.
- **Web3 Business Logic**:
    - Standardized session fees at **0.005 ETH** with a 5% protocol revenue model.
    - Integrated a developer easter egg for wallet `0x60eCc...fbd39` (ID: M1n9yu_3an9).
    - Configured official test therapist account at `0x8Ec7F...5B2cD`.

- **UI 架構**: 完成 **Liquid Glass (流體玻璃)** 設計系統，實作病患大廳與醫師專屬門戶。
- **聊天邏輯**: 建立加密 P2P 聊天介面，內建 50 分鐘看診計時器、10 分鐘結束預警及模擬雙重簽章資金釋放流程。
- **後端 (Supabase)**:
    - 完成資料表架構部署：`patients`, `therapists`, `sessions`, `redeem_codes`。
    - 實作 API 路由，支持醫師資料動態讀取與支援代碼 (Support Code) 安全核銷。
- **Web3 商業邏輯**:
    - 統一諮商費率為 **0.005 ETH**，並預置 5% 平台營運分潤邏輯。
    - 植入開發者專屬彩蛋 (帳號: M1n9yu_3an9，綁定地址 `0x60eCc...fbd39`)。
    - 完成正式測試醫師帳號配置 (`0x8Ec7F...5B2cD`)。

**Author:** Mingyu Wang
*Last updated: 2026-03-17*
