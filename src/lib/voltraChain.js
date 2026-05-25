// voltraChain.js — ESM version for Voltra backend
import { ethers } from 'ethers'

const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL)
const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider)

const MEMBERSHIP_ABI = [
  'function mint(address to, string name, string matricola, string grado) returns (uint256)',
  'function getMember(uint256 tokenId) view returns (string,string,string,uint256)',
  'function totalMinted() view returns (uint256)',
  'event MemberCertified(uint256 indexed tokenId, address indexed to, string matricola, string grado, uint256 admittedAt)',
]

const MISSION_ABI = [
  'function mint(address to, string matricola, string grado, uint256 budgetUsd) returns (uint256,uint256)',
  'function getMission(uint256 tokenId) view returns (string,string,uint256,uint256,uint256)',
  'function missionCountOf(string matricola) view returns (uint256)',
  'function totalMinted() view returns (uint256)',
  'event MissionCertified(uint256 indexed tokenId, address indexed to, string matricola, string grado, uint256 budgetUsd, uint256 missionNo, uint256 startedAt)',
]

const membership = new ethers.Contract(process.env.MEMBERSHIP_ADDRESS, MEMBERSHIP_ABI, signer)
const mission = new ethers.Contract(process.env.MISSION_ADDRESS, MISSION_ABI, signer)

export async function certifyMember({ to, name, matricola, grado }) {
  const tx = await membership.mint(to, name, matricola, grado)
  const receipt = await tx.wait()
  let tokenId = null
  for (const log of receipt.logs) {
    try {
      const parsed = membership.interface.parseLog(log)
      if (parsed?.name === 'MemberCertified') { tokenId = parsed.args.tokenId.toString(); break }
    } catch (_) {}
  }
  return { txHash: receipt.hash, tokenId }
}

export async function certifyMission({ to, matricola, grado, budgetUsd }) {
  const tx = await mission.mint(to, matricola, grado, BigInt(budgetUsd))
  const receipt = await tx.wait()
  let tokenId = null, missionNo = null
  for (const log of receipt.logs) {
    try {
      const parsed = mission.interface.parseLog(log)
      if (parsed?.name === 'MissionCertified') {
        tokenId = parsed.args.tokenId.toString()
        missionNo = parsed.args.missionNo.toString()
        break
      }
    } catch (_) {}
  }
  return { txHash: receipt.hash, tokenId, missionNo }
}

export async function readMember(tokenId) {
  const [name, matricola, grado, admittedAt] = await membership.getMember(tokenId)
  return { name, matricola, grado, admittedAt: Number(admittedAt) }
}

export async function readMission(tokenId) {
  const [matricola, grado, budgetUsd, missionNo, startedAt] = await mission.getMission(tokenId)
  return { matricola, grado, budgetUsd: Number(budgetUsd), missionNo: Number(missionNo), startedAt: Number(startedAt) }
}

export async function getTotalMemberships() {
  return Number(await membership.totalMinted())
}

export async function getTotalMissions() {
  return Number(await mission.totalMinted())
}

export { membership, mission }
