require('dotenv').config();
const Web3 = require('web3')

// Can be 'safeLow', 'standard', or 'fast' - see: https://gasstation-mainnet.matic.network/v2
const GAS_SPEED = 'standard'

// Abort the operation if estimated gas exceeds this limit, specified in MATIC
const GAS_COST_LIMIT_MATIC = 0.05

const PET_ABI = [{"inputs":[{"internalType":"uint256[]","name":"_tokenIds","type":"uint256[]"}],"name":"interact","outputs":[],"stateMutability":"nonpayable","type":"function"}];
const POLYGON_RPC_HOST = "https://polygon-rpc.com/"
const POLYGON_GAS_STATION_HOST = "https://gasstation-mainnet.matic.network/v2"
const AAVEGOTCHI_DIAMOND_INSTANCE_CONTRACT = "0x86935F11C86623deC8a25696E1C19a8659CbF95d";

const PETTER_WALLET_ADDRESS = process.env.PETTER_WALLET_ADDRESS
const PETTER_WALLET_KEY = process.env.PETTER_WALLET_KEY
const GOTCHI_IDS = process.env.GOTCHI_IDS.split(",")

const web3 = new Web3(POLYGON_RPC_HOST)
const pettingContract = new web3.eth.Contract(PET_ABI, AAVEGOTCHI_DIAMOND_INSTANCE_CONTRACT)

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

const createPetTransaction = async () => ({
  nonce: await web3.eth.getTransactionCount(PETTER_WALLET_ADDRESS),
  from: PETTER_WALLET_ADDRESS,
  to: AAVEGOTCHI_DIAMOND_INSTANCE_CONTRACT,
  data: pettingContract.methods.interact(GOTCHI_IDS).encodeABI()
})

const setTransactionGasToMarket = async (tx) => Object.assign({
    gasLimit: await web3.eth.estimateGas(tx),
    maxPriorityFeePerGas: Math.ceil(convertGweiToWei((await getCurrentGasPrices())[GAS_SPEED].maxPriorityFee)) 
  }, tx)

const signPetTransaction = (unsignedTransaction) => web3.eth.accounts.signTransaction(unsignedTransaction, PETTER_WALLET_KEY)
const sendPetTransaction = (signedTransaction) => web3.eth.sendSignedTransaction(signedTransaction.rawTransaction)

const notifySending = (payload) => console.log('Sending transaction...')
const notifySent = (payload) => console.log('Transaction sent.')
const notifyHash = (hash) => console.log('Transaction hash is ' + hash)
const notifyReceipt = (receipt) => console.log("Obtained receipt:\n\n" + JSON.stringify(receipt, null, 2) + "\n")
const notifyComplete = (receipt) => console.log('Transaction complete.')
const notifyError = (error) => Promise.reject(error)

async function main() {
  const petTransaction = await setTransactionGasToMarket(await createPetTransaction())
  console.log("Pet transaction created: \n\n" + JSON.stringify(petTransaction, null, 2) + "\n")
  const estimatedGasCostMatic = convertWeiToMatic(petTransaction.gasLimit * (petTransaction.maxPriorityFeePerGas + convertGweiToWei((await getCurrentGasPrices()).estimatedBaseFee)))
  console.log("Estimated gas cost is ~" + estimatedGasCostMatic.toFixed(6) + " MATIC")
  if (estimatedGasCostMatic > GAS_COST_LIMIT_MATIC) {
    console.log('ABORTED: Estimated gas cost exceeds limit. GAS_COST_LIMIT_MATIC=' + GAS_COST_LIMIT_MATIC)
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

main()