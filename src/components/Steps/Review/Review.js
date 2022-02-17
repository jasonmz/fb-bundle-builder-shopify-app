import React, { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { Redirect } from 'react-router-dom'
import {
  getSelectedBundle,
  useShopifyCart,
  saveCart,
  withActiveStep
} from '../../Hooks'
import dayjs from 'dayjs'
import weekday from 'dayjs/plugin/weekday'
import advancedFormat from 'dayjs/plugin/advancedFormat'
import styles from './Review.module.scss'
import Loading from '../Components/Loading'
import TopTitle from '../Components/TopTitle'
import DeliveryDateModal from '../Components/DeliveryDatesModal/DeliveryDateModal'
import { getBundleByPlatformId } from '../../Hooks/withBundleApi'
import { clearLocalStorage } from '../../../store/store'
import { cart, getNextWeekDay, smoothScrollingToId } from '../../../utils'
import Toast from '../../Global/Toast'
import { ReviewDeliveryDay, ReviewStartingDay } from '.'
import ReviewItems from './ReviewItems'

dayjs.extend(advancedFormat)
dayjs.extend(weekday)

const DEFAULT_ERROR_MESSAGE = 'There was an error. Please try again later'
const STEP_ID = 5

const Review = () => {
  const [isLoading, setIsLoading] = useState(false)
  const state = useSelector((state) => state)
  const [openEditDateModal, setOpenEditDateModal] = useState(false)
  const [platformCartToken, setPlatformCartToken] = useState('')
  const shopifyCart = useShopifyCart()
  const [errorMessage, setErrorMessage] = useState(false)
  const [showError, setShowError] = useState(false)
  const [mappedCart, setMappedCart] = useState({})
  const cartUtility = cart(state)

  useEffect(() => {
    getShopifyCartToken()
    console.log('cartUtility.mapByTypes() >>>', cartUtility.mapByTypes())
    setMappedCart(cartUtility.mapByTypes())
  }, [])

  useEffect(() => {
    if (state.triggerLastStep) {
      handleSubmit()
    }
  }, [state.triggerLastStep])

  useEffect(() => {
    smoothScrollingToId('reviewTop')
  })

  const getShopifyCartToken = async () => {
    const token = await shopifyCart.getToken()
    setPlatformCartToken(token)
  }

  const getTotal = () => {
    return cartUtility.calculateSubTotal(
      state.bundle.price,
      state.bundle.breakfast.price,
      state.bundle.entreesQuantity,
      state.bundle.breakfastsQuantity
    )
  }

  const addShopifyCartItems = async () => {
    try {
      const clearCart = await shopifyCart.clearCart()

      if (clearCart.status !== 200) {
        throw new Error('Can not clear cart.')
      }

      const shopifyBundleProduct = getSelectedBundle(state.bundle.breakfast.tag)
      const selectedVariant = shopifyBundleProduct.variants.filter(
        (v) =>
          v.title.includes(state.entreeType.title) &&
          v.title.includes(state.entreeSubType.title)
      )
      console.log('shopifyBundleProduct', shopifyBundleProduct)
      console.log('selectedVariant', selectedVariant)
      if (
        shopifyBundleProduct.variants &&
        shopifyBundleProduct.variants.length > 0
      ) {
        const variant =
          selectedVariant.length > 0
            ? selectedVariant[0]
            : shopifyBundleProduct.variants[0]
        const sellingPlanId =
          selectedVariant.length > 0
            ? variant.selling_plan_allocations[0].selling_plan_id
            : null

        const response = await shopifyCart.create({
          attributes: {
            'delivery-date': dayjs()
              .day(state.location.deliveryDate.day)
              .add(1, 'week')
              .format('YYYY-MM-DD'),
            'delivery-day': getNextWeekDay(
              state.location.deliveryDate.day
            ).format('dddd')
          },
          items: [
            {
              id: variant.id,
              selling_plan: sellingPlanId,
              quantity: 1,
              properties: {
                'Customer Id': shopCustomer?.id,
                'Cart Token': platformCartToken,
                Delivery_Date: dayjs()
                  .day(state.location.deliveryDate.day)
                  .add(1, 'week')
                  .format('YYYY-MM-DD')
              }
            }
          ]
        })

        console.log('add to cart response', response)

        if (response.status !== 200) {
          throw new Error('Can not add product to the cart')
        }
      } else {
        setIsLoading(false)
        setShowError(true)
        return setErrorMessage(DEFAULT_ERROR_MESSAGE)
      }
    } catch (e) {
      console.error(e)
      setShowError(true)
      setIsLoading(false)
      return setErrorMessage(DEFAULT_ERROR_MESSAGE)
    }
  }

  const handleSubmit = async () => {
    try {
      await addShopifyCartItems()

      const shopifyProduct = getSelectedBundle(state.bundle.breakfast.tag)
      const currentBundle = await getBundleByPlatformId(
        state.tokens.guestToken,
        shopifyProduct.id
      )

      if (currentBundle.data.data.length === 0) {
        return setErrorMessage(DEFAULT_ERROR_MESSAGE)
      }

      const mappedItems = state.cart.map((item) => ({
        bundle_configuration_content_id: item.configurationContentId,
        platform_product_variant_id: item.id,
        quantity: item.quantity
      }))

      await saveCart(
        state.tokens.guestToken,
        shopCustomer.id,
        platformCartToken,
        currentBundle.data.data[0].id,
        state.location.deliveryDate.day,
        state.entreeType.title.toLowerCase(),
        state.entreeSubType.title.toLowerCase(),
        mappedItems
      )

      clearLocalStorage()
      window.location.href = '/checkout'
    } catch (error) {
      setIsLoading(false)
      setShowError(true)
      return setErrorMessage(DEFAULT_ERROR_MESSAGE)
    }
  }

  const closeAlert = () => {
    setShowError(false)
    setErrorMessage(false)
  }

  if (Number(shopCustomer.id) === 0 || state.bundle.weeklyPrice === 0) {
    return <Redirect push to="/steps/2" />
  }

  if (state.cart.length === 0) {
    return <Redirect push to="/steps/4" />
  }

  if (isLoading) {
    return <Loading />
  }

  return (
    <>
      <div className="defaultWrapper" id="reviewTop">
        <div className={styles.wrapper}>
          <TopTitle
            title="Review Your Order"
            subTitle={
              <ReviewDeliveryDay date={state.location.deliveryDate.day} />
            }
          >
            <ReviewStartingDay day={state.location.deliveryDate.day} />
          </TopTitle>
          <div className={`${styles.menuItemsWrapper} mb-8`}>
            {mappedCart.types && <ReviewItems items={mappedCart} />}
          </div>
        </div>
      </div>
      {showError ? (
        <Toast
          open={showError}
          status="Danger"
          message={errorMessage}
          displayTitle={false}
          handleClose={closeAlert}
        />
      ) : (
        ''
      )}
      <DeliveryDateModal
        open={openEditDateModal}
        close={() => setOpenEditDateModal(false)}
      />
    </>
  )
}

export default withActiveStep(Review, STEP_ID)
