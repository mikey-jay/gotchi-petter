require('dotenv').config();

// Can be 'safeLow', 'standard', or 'fast' - see: https://gasstation-mainnet.matic.network/v2
const GAS_SPEED = 'standard'

// Abort the operation if estimated gas exceeds this limit, specified in MATIC
const GAS_COST_LIMIT_MATIC = 0.05

const ABI = require('./abi.js')
const POLYGON_RPC_HOST = process.env.POLYGON_RPC_HOST || "https://polygon-rpc.com/"
const POLYGON_GAS_STATION_HOST = "https://gasstation-mainnet.matic.network/v2"
const AAVEGOTCHI_DIAMOND_ADDRESS = "0x86935F11C86623deC8a25696E1C19a8659CbF95d"

const PETTER_WALLET_ADDRESS = process.env.PETTER_WALLET_ADDRESS
const PETTER_WALLET_KEY = process.env.PETTER_WALLET_KEY
const GOTCHI_IDS = process.env.GOTCHI_IDS.split(",")

const SECONDS_BETWEEN_PETS = 60 * 60 * 12 // don't pet a gotchi if has been pet in the last 12 hours

/*
How often to check the status of gotchis on the blockchain to see if it's time to pet
I do not recommend reducing this time, as it could lead to unnecessary petting and wasted gas
if the prior pet transaction takes more than this amount of time to be confirmed.

Setting this duration too long is also undesirable as it leaves gotchis unpet for some time.
*/
const MILLISECONDS_BETWEEN_RETRIES = 1000 * 60 * 15 // 15 minutes

const getLogTimestamp = () => (new Date()).toISOString().substring(0,19)
const log = (message) => console.log(`${getLogTimestamp()}: ${message}`)

const Web3 = require('web3')
const web3 = new Web3(POLYGON_RPC_HOST)
const contract = new web3.eth.Contract(ABI, AAVEGOTCHI_DIAMOND_ADDRESS)

const convertGweiToWei = (gwei) => gwei * (10 ** 9)
const convertWeiToMatic = (wei) => wei / (10 ** 18)

const getCurrentGasPrices = () => new Promise((resolve, reject) => {
  const https = require('https')
  https.get(POLYGON_GAS_STATION_HOST, (res) =>{
    const { statusCode } = res
    let rawData = ''
    res.on('data', (chunk) => rawData += chunk)
    res.on('end', () => {
      const gasData = JSON.parse(rawData)
      if (gasData['error'])
        reject(new Error(`Polygon gas station error: ${gasData.error.message}`))
      else if (typeof gasData[GAS_SPEED] == 'undefined')
        reject(new Error(`Polygon gas station response does not include any data for gas speed '${GAS_SPEED}' (rawData=${rawData})`))
      else
        resolve(gasData)
    })
  })
})

const createPetTransaction = async (idsOfGotchisToPet) => ({
  from: PETTER_WALLET_ADDRESS,
  to: AAVEGOTCHI_DIAMOND_ADDRESS,
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

const getGotchi = (gotchiId) => contract.methods.getAavegotchi(gotchiId).call()
const getSecondsSinceLastPet = (gotchi) => Math.floor(Date.now() / 1000) - gotchi.lastInteracted
const isReadyToBePet = (gotchi) => getSecondsSinceLastPet(gotchi) > SECONDS_BETWEEN_PETS

const filterPettableGotchiIds = async (unfilteredIds) => {
  var pettableIds = []
  for (id of unfilteredIds) {
    var gotchi = undefined
    log(`Checking status of gotchi (id=${id})`)
    try {
      gotchi = await getGotchi(id)
    } catch (err) {
      log(`Error while fetching gotchi (id=${id}): ${err}`)
      break
    }
    log(`Found gotchi: (id=${gotchi.tokenId}, lastInteracted=${new Date(gotchi.lastInteracted * 1000)})`)
    isReadyToBePet(gotchi) ? pettableIds.push(id) : log("Gotchi with id " + id + " is not ready to be pet yet")
  }
  return pettableIds;
}

async function petAavegotchis(ids) {
  if (ids.length == 0) {
    log("There are no gotchis to be pet at this time.")
    return
  }
  log(`Petting gotchis with ids: ${ids}`)
  try {
    var petTransaction = await setTransactionGasToMarket(await createPetTransaction(ids))
  } catch (err) {
    return Promise.reject(`Error creating transaction: ${err.message}`)
  }
  log(`Creating pet transaction: (from=${petTransaction.from}, to=${petTransaction.to}, gasLimit=${petTransaction.gasLimit}, maxPriorityFeePerGas=${petTransaction.maxPriorityFeePerGas})`)
  const estimatedGasCostMatic = convertWeiToMatic(petTransaction.gasLimit * (petTransaction.maxPriorityFeePerGas + convertGweiToWei((await getCurrentGasPrices()).estimatedBaseFee)))
  log("Estimated gas cost is ~" + estimatedGasCostMatic.toFixed(6) + " MATIC")
  if (estimatedGasCostMatic > GAS_COST_LIMIT_MATIC) {
    log('ABORTED: Estimated gas cost exceeds limit. GAS_COST_LIMIT_MATIC=' + GAS_COST_LIMIT_MATIC)
  } else {
    return sendPetTransaction(await signPetTransaction(petTransaction))
      .once('sending', notifySending)
      .once('sent', notifySent)
      .once('transactionHash', notifyHash)
      .once('receipt', notifyReceipt)
      .on('error', notifyError)
      .then(notifyComplete).catch(notifyError)
  }
}

const loop = () => filterPettableGotchiIds(GOTCHI_IDS).then(petAavegotchis).catch(log)

loop().then(() => setInterval(loop, MILLISECONDS_BETWEEN_RETRIES))