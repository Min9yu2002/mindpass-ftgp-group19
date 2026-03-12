# MindPass MVP Scope

## Project Goal
Build a privacy-preserving DApp prototype for mental-health record proof and access control.

## What the MVP Will Do
- Let a user prepare an encrypted record for off-chain storage
- Store the file hash on-chain
- Allow the user to grant access to a therapist wallet address
- Allow the user to revoke future access
- Let the system verify record integrity through hash checking

## What the MVP Will Not Do
- Full therapist identity or licence verification
- Peer-support matching
- Emergency response functions
- Advanced reputation or review systems
- Complex DAO governance

## Core User Flow
1. User encrypts a private record off-chain
2. User uploads the encrypted file to off-chain storage
3. User stores the record hash on-chain
4. User grants access to a therapist wallet
5. Therapist view checks whether access is granted
6. User revokes future access
7. Record integrity can be verified by comparing hashes

## Demo Focus
The demo should clearly show:
- hash registration
- permission granting
- permission revocation
- integrity verification

## Notes
This MVP focuses on proof, access control, and auditability rather than a full production-grade healthcare platform.
