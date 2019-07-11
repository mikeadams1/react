/**
 * Gets sha256 string from string
 *
 * @param {string} str - A string to be hashed
 * @returns {Promise <string>} A promise of a sha256 hash of that string
 */
async function sha256 (str) {
  var bytes = new TextEncoder('utf-8').encode(str)
  const buf = await crypto.subtle.digest('SHA-256', bytes)
  return Array.prototype.map
    .call(new Uint8Array(buf), x => ('00' + x.toString(16)).slice(-2))
    .join('')
}

/**
 * Hex to bytes
 *
 * @param {string} str A hex string
 * @returns {int[]} An array of bytes
 */
function hexToBytes (str) {
  var result = []
  while (str.length >= 2) {
    result.push(parseInt(str.substring(0, 2), 16))
    str = str.substring(2, str.length)
  }
  return result
}

/**
 * Get encoded point
 *
 * @param {*} pt
 * @param {*} compressed
 * @returns {int[]} Array of bytes
 */
function getEncoded (pt, compressed) {
  var x = pt.getX().toBigInteger()
  var y = pt.getY().toBigInteger()
  var enc = integerToBytes(x, 32)
  if (compressed) {
    if (y.isEven()) {
      enc.unshift(0x02)
    } else {
      enc.unshift(0x03)
    }
  } else {
    enc.unshift(0x04)
    enc = enc.concat(integerToBytes(y, 32))
  }
  return enc
}

/**
 * Get an EC Key from hash
 *
 * @param {string} hash
 * @returns ECKey
 */
function getECKeyFromHash (hash) {
  var eckey = new Bitcoin.ECKey(hexToBytes(hash))
  return eckey
}

/**
 * Get a private key address form hash
 *
 * @param {string} hash A hash
 * @param {string} addressType A string of compressed or uncompressed
 * @param {string} publicKeyVersion Version number of the public key
 * @returns {Bitcoin.Address} A bitcoin private key address
 */
function getPrivateKeyAddressFromHash (hash, addressType, publicKeyVersion) {
  const OFFSET = 128
  var payload = hexToBytes(hash)
  if (addressType === 'compressed') {
    payload.push(0x01)
  }
  var sec = new Bitcoin.Address(payload)
  sec.version = parseInt(publicKeyVersion) + OFFSET
  return sec
}

/**
 * Get public key from private
 *
 * @param {*} eckey
 * @param {*} addressType
 * @param {*} publicKeyVersion
 * @returns {Bitcoin.Address} A bticoin public key address
 */
function getPublicKeyFromPrivate (eckey, addressType, publicKeyVersion) {
  var curve = getSECCurveByName('secp256k1')
  var publicKey = {}
  var genPt = curve.getG().multiply(eckey.priv)
  if (addressType === 'uncompressed') {
    publicKey.pub = getEncoded(genPt, false)
  } else {
    publicKey.pub = getEncoded(genPt, true)
  }

  // get pub key hash
  publicKey.ripe160 = Bitcoin.Util.sha256ripe160(publicKey.pub)

  // get pub key address
  var address = new Bitcoin.Address(publicKey.ripe160)
  address.version = parseInt(publicKeyVersion)
  publicKey.address = address
  return publicKey
}

/**
 * Gets a key pair from a hash
 *
 * @param {*} hash
 * @param {*} addressType
 * @param {*} publicKeyVersion
 * @returns {*} A keypair
 */
function getKeyPairFromHash (hash, addressType, publicKeyVersion) {
  var keyPair = {}
  keyPair.hash = hash
  // get privkey from hash
  keyPair.privateKey = getECKeyFromHash(hash)

  // get privateKey address
  keyPair.privateKeyAddress = getPrivateKeyAddressFromHash(
    hash,
    addressType,
    publicKeyVersion
  )

  // get pub key from private
  keyPair.publicKey = getPublicKeyFromPrivate(
    keyPair.privateKey,
    addressType,
    publicKeyVersion
  )

  return keyPair
}

/**
 * Gets a key pair from a string using sha245 KDF
 *
 * @param {*} pw
 * @param {*} addressType
 * @param {*} publicKeyVersion
 * @returns {*} A key pair
 */
async function getKeyPairFromPW (pw, addressType, publicKeyVersion) {
  var hash = await sha256(pw, addressType, publicKeyVersion)
  var keyPair = getKeyPairFromHash(hash, addressType, publicKeyVersion)
  return keyPair
}

/**
 * Main body of brain app
 *
 * @class Body
 * @extends {React.Component}
 */
class Body extends React.Component {
  /**
   *Creates an instance of Body.
   * @param {*} props
   * @memberof Body
   */
  constructor (props) {
    super(props)
    var prefix = window.location.hash ? decodeURIComponent(window.location.hash).substring(1) : window.location.hash || localStorage.getItem('prefix') || ''
    this.state = {
      pw: '',
      prefix: prefix,
      sha256: '',
      publicKeyVersion: 0,
      addressType: 'uncompressed',
      timeTaken: 0,
      eckey: {}
    }
    this.handleSubmit = this.handleSubmit.bind(this)
    this.handleChange = this.handleChange.bind(this)
  }

  handleSubmit (e) {
    e.preventDefault()
  }

  /**
   * handle all form changes
   *
   * @param {*} e
   * @memberof Body
   */
  async handleChange (event) {
    let startTime = new Date().getTime()

    var pw = this.state.pw
    var prefix = this.state.prefix

    if (event && event.target) {
      var name = event.target.name
    }

    var combined = pw + prefix

    if (name === 'pw') {
      this.setState({ pw: event.target.value })
      combined = event.target.value + prefix
    } else if (name === 'publicKeyVersion') {
      this.setState({ publicKeyVersion: event.target.value })
    } else if (name === 'addressType') {
      this.setState({ addressType: event.target.value })
    } else if (name === 'prefix') {
      this.setState({ prefix: event.target.value })
      combined = pw + event.target.value
      localStorage.setItem('prefix', event.target.value)
      let href = window.location.href.split('#')[0]
      href += '#'
      href += event.target.value
      history.pushState({}, 'Brain Plus', href)
    }

    var uncompressed = await getKeyPairFromPW(
      combined,
      'uncompressed',
      this.state.publicKeyVersion
    )

    var compressed = await getKeyPairFromPW(
      combined,
      'compressed',
      this.state.publicKeyVersion
    )

    // benchmark
    var timeTaken = new Date().getTime() - startTime

    // update state
    this.setState({
      sha256: uncompressed.hash,

      privateKeyInt: uncompressed.privateKey.priv,
      privateKeyAddress: uncompressed.privateKeyAddress,

      publicKeyBytes: uncompressed.publicKey.pub,
      ripe160: uncompressed.publicKey.ripe160,
      publicKeyAddress: uncompressed.publicKey.address,
      publicKeyAddressC: compressed.publicKey.address,

      timeTaken: timeTaken
    })
  }


  async componentDidMount() {
    this.handleChange()
  }

  /**
   * renders the form
   *
   * @returns
   * @memberof Body
   */
  render () {
    return (
      <section className='section'>
        <form onSubmit={this.handleSubmit}>
          <div className='columns'>
            <div className='column'>
              <select
                name='addressType'
                onChange={this.handleChange}
                value={this.state.addressType}
              >
                <option value='uncompressed'>
                  Uncompressed
                </option>
                <option value='compressed'>Compressed</option>
              </select>
              <select
                name='publicKeyVersion'
                onChange={this.handleChange}
                value={this.state.publicKeyVersion}
              >
                <option value='0'>
                  Bitcoin
                </option>
                <option value='85'>Bitmark</option>
                <option value='111'>Testnet3</option>
              </select>
              <hr />
              <label>Passphrase</label>
              <br />
              <input
                name='pw'
                size='60'
                type='text'
                placeholder='Enter passphrase'
                value={this.state.pw}
                onChange={this.handleChange}
                autoFocus
              />
              <hr />
              <label>Prefix</label>
              <br />
              <input
                name='prefix'
                size='60'
                type='text'
                placeholder='Enter prefix'
                value={this.state.prefix}
                onChange={this.handleChange}
              />
              <hr />
              Private Key
              <br />
              <input
                readOnly
                size='60'
                placeholder='Private Key'
                value={this.state.privateKeyAddress}
              />
              <br/>
              Public Key (uncompressed)
              <br />
              <input
                readOnly
                size='60'
                placeholder='Public Key (uncompressed)'
                value={this.state.publicKeyAddress}
              />
              <br />
              Public Key (compressed)
              <br />
              <input
                readOnly
                size='60'
                placeholder='Public Key (compressed)'
                value={this.state.publicKeyAddressC}
              />
              <br />
              <hr />
              Computed in : {this.state.timeTaken} ms
            </div>
          </div>
        </form>
      </section>
    )
  }
}


function App() {
  return (
    <div>
      <NavbarSolidLogin 
        className="is-link" 
        title="Brain Wallet" 
        sourceCode="https://github.com/play-grounds/react/blob/gh-pages/play/brain.html" />
      <Body />
    </div>
  )
}

ReactDOM.render(
  <App />,
  document.getElementById('root')
)