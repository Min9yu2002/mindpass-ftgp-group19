# MindPass

MindPass is an FTGP group project focused on building a privacy-first mental health support DApp prototype.

The project explores how Web3 infrastructure can be used to support identity-aware access control, protected therapist–patient interactions, and hybrid on-chain/off-chain data management for sensitive counselling-related workflows.

## Team
- Mingyu Wang
- Zhengchi Zhang
- Haizhi Jiang
- Haoyuan Wu

## Project Summary
MindPass is a privacy-preserving DApp prototype for mental health support, therapist access control, and protected session workflows.

Sensitive counselling-related data is designed to remain off-chain in encrypted form, while blockchain components are used for proof, wallet-based identity, escrow-related logic, and permission tracking.

## Current MVP Scope
The current MVP focuses on the following areas:
- patient entry through the patient portal
- therapist entry through the therapist portal
- role-based browser session handling
- protected routing for patient and therapist pages
- therapist directory browsing on the patient side
- support code redemption and subsidy balance handling
- therapist verification and provider lobby flow
- hybrid off-chain / on-chain architecture for sensitive data and payment logic

## Authentication and Session Model
MindPass currently follows a single active browser session model.

A wallet may exist in both the `patients` and `therapists` tables in the database, but the browser only allows one active role at a time.

The active role is determined by the portal the user successfully logged in through:
- `/auth` establishes a patient session
- `/therapist-login` establishes a therapist session

The frontend currently supports these states:
- `guest`
- `unscoped`
- `patient`
- `therapist`

Navigation and route guards are rendered based on the active session rather than database-role precedence.

## What Works Now
The following features are currently working:
- patient login and dashboard entry
- therapist login and provider lobby entry
- role-aware navbar rendering
- protected routes for patient and therapist pages
- therapist listing fetch on the patient dashboard
- therapist name fallback:
  - `full_name || legal_name || "Anonymous Provider"`
- therapist specialty fallback:
  - `specialty || clinical_specialty || "General Specialist"`
- explicit session cleanup on sign out
- therapist authentication audit logging
- support code validation and subsidy balance handling

## Repository Structure
- `docs/` — project documents and planning notes
- `slides/` — presentation drafts and slide materials
- `contracts/` — smart contract files and deployment notes
- `frontend/` — website / DApp frontend files
- `meeting-notes/` — meeting records and task allocations

## Latest Update
This update focused on stabilising the initial login system and role-based session flow.

Key improvements include:
- initial patient and therapist login flow
- active-session-based browser role handling
- dashboard and provider lobby route protection
- therapist directory fetch fixes
- therapist display fallback for inconsistent database fields
- support code redemption and ghost-profile self-healing improvements

## Next Steps
Planned next steps include:
- deduplicating therapist authentication logs
- implementing booking and session records
- connecting booking flow to escrow / payment logic
- integrating XMTP / WebRTC communication
- refining therapist availability and session status workflows
- polishing navbar and session-related UI behaviour

## Notes
This repository currently reflects an early but stabilised MVP stage.

The authentication and role-based session flow has been implemented at an initial level, while booking, communication, and end-to-end session execution are still under active development.

**Author:** Mingyu Wang  
**Last updated:** 2026-03-17