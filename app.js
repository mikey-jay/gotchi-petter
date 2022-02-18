require('dotenv').config();

// Can be 'safeLow', 'standard', or 'fast' - see: https://gasstation-mainnet.matic.network/v2
const GAS_SPEED = 'standard'

// Abort the operation if estimated gas exceeds this limit, specified in MATIC
const GAS_COST_LIMIT_MATIC = 0.05

const ABI = require('./abi.js')
const POLYGON_RPC_HOST = "https://polygon-rpc.com/"
const POLYGON_GAS_STATION_HOST = "https://gasstation-mainnet.matic.network/v2"
const AAVEGOTCHI_GAME_FACET_ADDRESS = "0x86935F11C86623deC8a25696E1C19a8659CbF95d"

const PETTER_WALLET_ADDRESS = process.env.PETTER_WALLET_ADDRESS
const PETTER_WALLET_KEY = process.env.PETTER_WALLET_KEY
const GOTCHI_IDS = process.env.GOTCHI_IDS.split(",")

const SECONDS_BETWEEN_PETS = 60 * 60 * 12 // don't pet a gotchi if has been pet in the last 12 hours
const MILLISECONDS_BETWEEN_RETRIES = 1000 * 60 * 15 // check gotchi status every 15 minutes

const getLogTimestamp = () => (new Date()).toISOString().substring(0,19)
const log = (message) => console.log(`${getLogTimestamp()}: ${message}`)

const Web3 = require('web3')
const web3 = new Web3(POLYGON_RPC_HOST)
const contract = new web3.eth.Contract(ABI, AAVEGOTCHI_GAME_FACET_ADDRESS)

const convertGweiToWei = (gwei) => gwei * (10 ** 9)
const convertWeiToMatic = (wei) => wei / (10 ** 18)

const getCurrentGasPrices = () => new Promise((resolve, reject) => {
  const https = require('https')
  https.get(POLYGON_GAS_STATION_HOST, (res) =>{
    const { statusCode } = res
    let rawData = ''
    res.on('data', (chunk) => rawData += chunk)
    res.on('end', () => resolve(JSON.parse(rawData)))
  })
})

const createPetTransaction = async (idsOfGotchisToPet) => ({
  from: PETTER_WALLET_ADDRESS,
  to: AAVEGOTCHI_GAME_FACET_ADDRESS,
  data: contract.methods.interact(idsOfGotchisToPet).encodeABI()
})

const setTransactionGasToMarket = async (tx) => Object.assign({
    gasLimit: await web3.eth.estimateGas(tx),
    maxPriorityFeePerGas: Math.ceil(convertGweiToWei((await getCurrentGasPrices())[GAS_SPEED].maxPriorityFee)) 
  }, tx)

const signPetTransaction = (unsignedTransaction) => web3.eth.accounts.signTransaction(unsignedTransaction, PETTER_WALLET_KEY)
const sendPetTransaction = (signedTransaction) => web3.eth.sendSignedTransaction(signedTransaction.rawTransaction)

const notifySending = (payload) => log('Sending pet transaction...')
const notifySent = (payload) => log('Transaction sent.')
const notifyHash = (hash) => log('Transaction hash is ' + hash)
const notifyReceipt = (receipt) => log(`Obtained receipt for transaction (blockNumber=${receipt.blockNumber}, gasUsed=${receipt.gasUsed}, effectiveGasPrice=${receipt.effectiveGasPrice})`)
const notifyComplete = (receipt) => log('Transaction complete.')
const notifyError = (error) => Promise.reject(error)

const getGotchi = async (gotchiId) => await contract.methods.getAavegotchi(gotchiId).call()
const getSecondsSinceLastPet = (gotchi) => Math.floor(Date.now() / 1000) - gotchi.lastInteracted
const isGotchiReadyToBePet = async (gotchiId) => getSecondsSinceLastPet(await getGotchi(gotchiId)) > SECONDS_BETWEEN_PETS


async function petAavegotchis() {
  var idsOfGotchisToPet = []
  for (id of GOTCHI_IDS) {
    await isGotchiReadyToBePet(id) ? idsOfGotchisToPet.push(id) : log("Gotchi with id " + id + " is not ready to be pet yet")
  }
  if (idsOfGotchisToPet.length == 0) {
    log("There are no gotchis to be pet at this time.")
    return;
  }
  log(`Petting gotchis with ids: ${idsOfGotchisToPet}`)
  const petTransaction = await setTransactionGasToMarket(await createPetTransaction(idsOfGotchisToPet))
  log(`Creating pet transaction: (from=${petTransaction.from}, to=${petTransaction.to}, gasLimit=${petTransaction.gasLimit}, maxPriorityFeePerGas=${petTransaction.maxPriorityFeePerGas})`)
  const estimatedGasCostMatic = convertWeiToMatic(petTransaction.gasLimit * (petTransaction.maxPriorityFeePerGas + convertGweiToWei((await getCurrentGasPrices()).estimatedBaseFee)))
  log("Estimated gas cost is ~" + estimatedGasCostMatic.toFixed(6) + " MATIC")
  if (estimatedGasCostMatic > GAS_COST_LIMIT_MATIC) {
    log('ABORTED: Estimated gas cost exceeds limit. GAS_COST_LIMIT_MATIC=' + GAS_COST_LIMIT_MATIC)
  } else {
    sendPetTransaction(await signPetTransaction(petTransaction))
      .once('sending', notifySending)
      .once('sent', notifySent)
      .once('transactionHash', notifyHash)
      .once('receipt', notifyReceipt)
      .on('error', notifyError)
      .then(notifyComplete)
  }
}

petAavegotchis()
setInterval(petAavegotchis, MILLISECONDS_BETWEEN_RETRIES)