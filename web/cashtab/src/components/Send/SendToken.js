import React, { useState, useEffect } from 'react';
import { WalletContext } from '@utils/context';
import { Form, notification, message, Spin, Row, Col } from 'antd';
import Paragraph from 'antd/lib/typography/Paragraph';
import PrimaryButton, { SecondaryButton } from '@components/Common/PrimaryButton';
import { CashLoader, CashLoadingIcon } from '@components/Common/CustomIcons';
import {
    FormItemWithMaxAddon,
    FormItemWithQRCodeAddon,
} from '@components/Common/EnhancedInputs';
import useBCH from '@hooks/useBCH';
import { BalanceHeader } from './Send';
import { Redirect } from 'react-router-dom';
import useWindowDimensions from '@hooks/useWindowDimensions';
import { isMobile, isIOS, isSafari } from 'react-device-detect';
import { Img } from 'react-image';
import makeBlockie from 'ethereum-blockies-base64';
import BigNumber from 'bignumber.js';
import { currency } from '@components/Common/Ticker.js';
import { Event } from '@utils/GoogleAnalytics';

const SendToken = ({ tokenId }) => {
    const { wallet, tokens, slpBalancesAndUtxos, apiError } = React.useContext(
        WalletContext,
    );
    const token = tokens.find(token => token.tokenId === tokenId);
    const [sendTokenAmountError, setSendTokenAmountError] = useState(false);

    // Get device window width
    // If this is less than 769, the page will open with QR scanner open
    const { width } = useWindowDimensions();
    // Load with QR code open if device is mobile and NOT iOS + anything but safari
    const scannerSupported = width < 769 && isMobile && !(isIOS && !isSafari);

    const [formData, setFormData] = useState({
        dirty: true,
        value: '',
        address: '',
    });
    const [loading, setLoading] = useState(false);

    const { getBCH, getRestUrl, sendToken } = useBCH();
    const BCH = getBCH();

    // Keep this function around for re-enabling later
    // eslint-disable-next-line no-unused-vars
    async function submit() {
        setFormData({
            ...formData,
            dirty: false,
        });

        if (
            !formData.address ||
            !formData.value ||
            Number(formData.value <= 0) ||
            sendTokenAmountError
        ) {
            return;
        }

        // Event("Category", "Action", "Label")
        // Track number of SLPA send transactions and
        // SLPA token IDs
        Event('SendToken.js', 'Send', tokenId);

        setLoading(true);
        const { address, value } = formData;

        try {
            const link = await sendToken(BCH, wallet, slpBalancesAndUtxos, {
                tokenId: tokenId,
                tokenReceiverAddress: address,
                amount: value,
            });

            notification.success({
                message: 'Success',
                description: (
                    <a href={link} target="_blank" rel="noopener noreferrer">
                        <Paragraph>
                            Transaction successful. Click or tap here for more
                            details
                        </Paragraph>
                    </a>
                ),
                duration: 5,
            });
        } catch (e) {
            setLoading(false);
            let message;

            if (!e.error && !e.message) {
                message = `Transaction failed: no response from ${getRestUrl()}.`;
            } else if (
                /Could not communicate with full node or other external service/.test(
                    e.error,
                )
            ) {
                message = 'Could not communicate with API. Please try again.';
            } else {
                message = e.message || e.error || JSON.stringify(e);
            }
            console.log(e);
            notification.error({
                message: 'Error',
                description: message,
                duration: 3,
            });
            console.error(e);
        }
    }

    const handleSlpAmountChange = e => {
        let error = false;
        const { value, name } = e.target;

        // test if exceeds balance using BigNumber
        let isGreaterThanBalance = false;
        if (!isNaN(value)) {
            const bigValue = new BigNumber(value);
            // Returns 1 if greater, -1 if less, 0 if the same, null if n/a
            isGreaterThanBalance = bigValue.comparedTo(token.balance);
        }

        // Validate value for > 0
        if (isNaN(value)) {
            error = 'Amount must be a number';
        } else if (value <= 0) {
            error = 'Amount must be greater than 0';
        } else if (token && token.balance && isGreaterThanBalance === 1) {
            error = `Amount cannot exceed your ${token.info.tokenTicker} balance of ${token.balance}`;
        } else if (!isNaN(value) && value.toString().includes('.')) {
            if (value.toString().split('.')[1].length > token.info.decimals) {
                error = `This token only supports ${token.info.decimals} decimal places`;
            }
        }
        setSendTokenAmountError(error);
        setFormData(p => ({ ...p, [name]: value }));
    };

    const handleChange = e => {
        const { value, name } = e.target;

        setFormData(p => ({ ...p, [name]: value }));
    };

    const onMax = async () => {
        // Clear this error before updating field
        setSendTokenAmountError(false);
        try {
            let value = token.balance;

            setFormData({
                ...formData,
                value,
            });
        } catch (err) {
            console.log(`Error in onMax:`);
            console.log(err);
            message.error(
                'Unable to calculate the max value due to network errors',
            );
        }
    };

    useEffect(() => {
        // If the balance has changed, unlock the UI
        // This is redundant, if backend has refreshed in 1.75s timeout below, UI will already be unlocked

        setLoading(false);
    }, [token]);

    return (
        <>
            {!token && <Redirect to="/" />}

            {token && (
                <>
                    <BalanceHeader>
                        <p>Available balance</p>
                        <h3>
                            {token.balance.toString()} {token.info.tokenTicker}
                        </h3>
                    </BalanceHeader>

                    <Row type="flex">
                        <Col span={24}>
                            <Spin
                                style={{ color: 'red' }}
                                spinning={loading}
                                indicator={CashLoadingIcon}
                            >
                                <Form style={{ width: 'auto' }}>
                                    <FormItemWithQRCodeAddon
                                        loadWithCameraOpen={scannerSupported}
                                        validateStatus={
                                            !formData.dirty && !formData.address
                                                ? 'error'
                                                : ''
                                        }
                                        help={
                                            !formData.dirty && !formData.address
                                                ? 'Should be a valid bch address'
                                                : ''
                                        }
                                        onScan={result =>
                                            setFormData({
                                                ...formData,
                                                address: result,
                                            })
                                        }
                                        inputProps={{
                                            placeholder: `${currency.tokenTicker} Address`,
                                            name: 'address',
                                            onChange: e => handleChange(e),
                                            required: true,
                                            value: formData.address,
                                        }}
                                    />
                                    <FormItemWithMaxAddon
                                        validateStatus={
                                            sendTokenAmountError ? 'error' : ''
                                        }
                                        help={
                                            sendTokenAmountError
                                                ? sendTokenAmountError
                                                : ''
                                        }
                                        onMax={onMax}
                                        inputProps={{
                                            name: 'value',
                                            placeholder: 'Amount',
                                            prefix:
                                                currency.tokenIconsUrl !==
                                                '' ? (
                                                    <Img
                                                        src={`${currency.tokenIconsUrl}/${tokenId}.png`}
                                                        width={16}
                                                        height={16}
                                                        unloader={
                                                            <img
                                                                alt={`identicon of tokenId ${tokenId} `}
                                                                heigh="16"
                                                                width="16"
                                                                style={{
                                                                    borderRadius:
                                                                        '50%',
                                                                }}
                                                                key={`identicon-${tokenId}`}
                                                                src={makeBlockie(
                                                                    tokenId,
                                                                )}
                                                            />
                                                        }
                                                    />
                                                ) : (
                                                    <img
                                                        alt={`identicon of tokenId ${tokenId} `}
                                                        heigh="16"
                                                        width="16"
                                                        style={{
                                                            borderRadius: '50%',
                                                        }}
                                                        key={`identicon-${tokenId}`}
                                                        src={makeBlockie(
                                                            tokenId,
                                                        )}
                                                    />
                                                ),
                                            suffix: token.info.tokenTicker,
                                            onChange: e =>
                                                handleSlpAmountChange(e),
                                            required: true,
                                            value: formData.value,
                                        }}
                                    />
                                    <div style={{ paddingTop: '12px' }}>
                                        {apiError || sendTokenAmountError ? (
                                            <>
                                                <SecondaryButton>
                                                    Send {token.info.tokenName}
                                                </SecondaryButton>
                                                {apiError && <CashLoader />}
                                            </>
                                        ) : (
                                            <PrimaryButton
                                                onClick={() => submit()}
                                            >
                                                Send {token.info.tokenName}
                                            </PrimaryButton>
                                        )}
                                    </div>
                                    {apiError && (
                                        <p style={{ color: 'red' }}>
                                            <b>
                                                An error occured on our end.
                                                Reconnecting...
                                            </b>
                                        </p>
                                    )}
                                </Form>
                            </Spin>
                        </Col>
                    </Row>
                </>
            )}
        </>
    );
};

export default SendToken;
