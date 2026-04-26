const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MindPassEscrow", function () {
  const STATUS = {
    Funded: 3n,
    InSession: 4n,
    Completed: 5n,
  };

  async function deployEscrowFixture() {
    const [owner, patient, therapist, vault, treasury, other] = await ethers.getSigners();
    const escrow = await ethers.deployContract("MindPassEscrow", [vault.address, treasury.address]);
    await escrow.waitForDeployment();

    return { escrow, owner, patient, therapist, vault, treasury, other };
  }

  async function createFundedSession(fixture) {
    const { escrow, patient, therapist, vault } = fixture;

    const walletRequiredWei = ethers.parseEther("0.002");
    const subsidyRequiredWei = ethers.parseEther("0.003");

    await escrow
      .connect(patient)
      .createBookingRequest(
        therapist.address,
        walletRequiredWei,
        subsidyRequiredWei,
        ethers.encodeBytes32String("video")
      );

    const sessionId = 1n;

    await escrow.connect(therapist).acceptBooking(sessionId);
    await escrow.connect(patient).fundPatientPortion(sessionId, { value: walletRequiredWei });
    await escrow.connect(vault).fundSubsidyPortion(sessionId, { value: subsidyRequiredWei });

    return { ...fixture, sessionId, walletRequiredWei, subsidyRequiredWei };
  }

  async function createInSessionSession() {
    const funded = await createFundedSession(await loadFixture(deployEscrowFixture));
    const { escrow, patient, therapist, sessionId } = funded;

    await escrow.connect(patient).checkInAsPatient(sessionId);
    await escrow.connect(therapist).checkInAsTherapist(sessionId);

    return funded;
  }

  it("keeps the session open and unpaid after the first end request", async function () {
    const { escrow, patient, therapist, treasury, sessionId } = await createInSessionSession();

    await expect(escrow.connect(patient).requestSessionEnd(sessionId))
      .to.emit(escrow, "SessionEndRequested")
      .withArgs(sessionId, patient.address, anyValue);

    const session = await escrow.sessions(sessionId);
    expect(session.status).to.equal(STATUS.InSession);
    expect(await escrow.sessionEndRequestedBy(sessionId)).to.equal(patient.address);
    expect(await escrow.claimableBalance(therapist.address)).to.equal(0n);
    expect(await escrow.claimableBalance(treasury.address)).to.equal(0n);
  });

  it("completes the session and assigns the normal balances when the other participant confirms", async function () {
    const { escrow, patient, therapist, treasury, sessionId } = await createInSessionSession();
    const therapistPayout = await escrow.NORMAL_THERAPIST_PAYOUT();
    const protocolFee = await escrow.NORMAL_PROTOCOL_FEE();

    await escrow.connect(patient).requestSessionEnd(sessionId);
    await expect(escrow.connect(therapist).confirmSessionEnd(sessionId))
      .to.emit(escrow, "SessionCompleted")
      .withArgs(sessionId, therapistPayout, protocolFee, anyValue);

    const session = await escrow.sessions(sessionId);
    expect(session.status).to.equal(STATUS.Completed);
    expect(session.therapistPayoutWei).to.equal(therapistPayout);
    expect(session.protocolFeeWei).to.equal(protocolFee);
    expect(session.refundAmountWei).to.equal(0n);
    expect(await escrow.sessionEndRequestedBy(sessionId)).to.equal(ethers.ZeroAddress);
    expect(await escrow.claimableBalance(therapist.address)).to.equal(therapistPayout);
    expect(await escrow.claimableBalance(treasury.address)).to.equal(protocolFee);
    expect(await escrow.claimableBalance(patient.address)).to.equal(0n);
    expect(await escrow.activeSessionOfPatient(patient.address)).to.equal(0n);
  });

  it("does not let the same participant request and confirm alone", async function () {
    const { escrow, patient, sessionId } = await createInSessionSession();

    await escrow.connect(patient).requestSessionEnd(sessionId);

    await expect(escrow.connect(patient).confirmSessionEnd(sessionId))
      .to.be.revertedWithCustomError(escrow, "SessionEndRequesterCannotConfirm")
      .withArgs(sessionId, patient.address);
  });

  it("rejects request and confirm when the session is not InSession", async function () {
    const { escrow, patient, therapist, sessionId } = await createFundedSession(
      await loadFixture(deployEscrowFixture)
    );

    await expect(escrow.connect(patient).requestSessionEnd(sessionId))
      .to.be.revertedWithCustomError(escrow, "InvalidStatus")
      .withArgs(sessionId, STATUS.InSession, STATUS.Funded);

    await expect(escrow.connect(therapist).confirmSessionEnd(sessionId))
      .to.be.revertedWithCustomError(escrow, "InvalidStatus")
      .withArgs(sessionId, STATUS.InSession, STATUS.Funded);
  });

  it("fails cleanly on duplicate confirm after completion", async function () {
    const { escrow, patient, therapist, sessionId } = await createInSessionSession();

    await escrow.connect(patient).requestSessionEnd(sessionId);
    await escrow.connect(therapist).confirmSessionEnd(sessionId);

    await expect(escrow.connect(patient).confirmSessionEnd(sessionId))
      .to.be.revertedWithCustomError(escrow, "InvalidStatus")
      .withArgs(sessionId, STATUS.InSession, STATUS.Completed);
  });

  it("no longer exposes the funded unstarted manual cancellation entrypoint", async function () {
    const { escrow } = await loadFixture(deployEscrowFixture);

    expect(() => escrow.interface.getFunction("cancelUnstartedSession")).to.throw();
  });
});
