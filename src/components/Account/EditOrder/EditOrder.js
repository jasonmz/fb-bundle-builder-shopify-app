import React, { useEffect, useState } from 'react'
import {
  Link,
  Redirect,
  useParams,
  useLocation,
  useHistory
} from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import CardQuantities from '../../Cards/CardQuantities'
import {
  getContents,
  getBundle,
  useUserToken,
  saveBundle,
  updateBundle,
  getSubscriptionOrder
} from '../../Hooks'
import {
  cartRemoveItem,
  cartAddItem,
  displayHeader,
  displayFooter,
  selectFaqType,
  cartClear,
  setTokens,
  cartUpdate
} from '../../../store/slices/rootSlice'
import styles from './EditOrder.module.scss'
import weekday from 'dayjs/plugin/weekday'
import dayjs from 'dayjs'
import Loading from '../../Steps/Components/Loading'
import {
  cart,
  filterShopifyProducts,
  filterShopifyVariants
} from '../../../utils'
import {
  saveSubscriptionOrder,
  updateSubscriptionOrder
} from '../../Hooks/withBundleApi'

dayjs.extend(weekday)

const useQuery = () => {
  const { search } = useLocation()

  return React.useMemo(() => new URLSearchParams(search), [search])
}

const EditOrder = () => {
  const { orderId } = useParams()
  const query = useQuery()
  const state = useSelector((state) => state)
  const dispatch = useDispatch()
  const history = useHistory()
  const cartUtility = cart(state)

  const [bundle, setBundle] = useState({})
  const [disabledNextButton, setDisabledNextButton] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [menuItems, setMenuItems] = useState([])

  // total and remaining items to add
  const [quantities, setQuantities] = useState([])
  const [quantitiesCountdown, setQuantitiesCountdown] = useState([])

  useEffect(() => {
    dispatch(cartClear())
    dispatch(displayHeader(false))
    dispatch(displayFooter(false))
    dispatch(selectFaqType(null))

    getCurrentMenuItems()
  }, [])

  useEffect(() => {
    if (reduceQuantities(quantitiesCountdown) === 0) {
      setDisabledNextButton(false)
    }
  }, [quantities, quantitiesCountdown])

  const findProductFromVariant = async (variantId) =>
    new Promise((resolve) => {
      let foundProduct = {}
      for (const product of shopProducts) {
        const variant = product.variants.filter((v) => v.id === variantId)
        if (product.variants.filter((v) => v.id === variantId).length > 0) {
          foundProduct = {
            product,
            metafields: variant[0].metafields
          }
        }
      }

      resolve(foundProduct)
    })

  const getCustomerBundleItems = async (token) => {
    const subscriptionResponse = await getSubscriptionOrder(token, orderId)

    const currentItems = []
    if (subscriptionResponse.data.data) {
      for (const order of subscriptionResponse.data?.data) {
        const editItemsConfigArr = []

        if (order.bundle_configuration_content?.display_after) {
          const bundleProducts = false

          for (const product of order?.items) {
            const currentProduct = await findProductFromVariant(
              product.platform_product_variant_id
            )

            if (Object.entries(currentProduct).length > 0) {
              editItemsConfigArr.push({
                id: product.platform_product_variant_id,
                contentSelectionId: product.id,
                subscriptionContentId: order.id,
                title: currentProduct?.product?.title
                  ? currentProduct.product.title
                  : 'default product',
                image:
                  currentProduct?.product?.images &&
                  currentProduct.product?.images.length > 0
                    ? currentProduct.product.images[0]
                    : process.env.EMPTY_STATE_IMAGE,
                metafields:
                  currentProduct?.metafields?.length > 0
                    ? currentProduct.metafields
                    : [],
                quantity: product.quantity
              })
            }
          }

          currentItems.push({
            id: bundleProducts ? bundleProducts.id : order.id,
            bundleId: subscriptionResponse.data.data[0].subscription.bundle_id,
            products: editItemsConfigArr
          })
        }
      }

      setBundle(currentItems[0])
    }

    return currentItems
  }

  const handleSave = async () => {
    const itemsToSave = []
    const itemsToUpdate = []

    const getBundleProduct = (variantId) => {
      return bundle.products.find((p) => p.id === variantId)
    }

    const subscriptionContentId =
      bundle?.products[0].subscriptionContentId || null

    for (const item of menuItems) {
      for (const product of item.products) {
        const cartItem = state.cart.find((c) => c.id === product.id)

        if (cartItem) {
          if (cartItem && cartItem.quantity > 0 && product.quantity === 0) {
            itemsToSave.push({
              platform_product_variant_id: product.id,
              quantity: cartItem.quantity
            })
          } else {
            if (cartItem.quantity !== product.quantity) {
              const currentBundleProduct = getBundleProduct(product.id)
              itemsToSave.push({
                id: currentBundleProduct.contentSelectionId,
                platform_product_variant_id: product.id,
                quantity: cartItem.quantity
              })
            }
          }
        } else {
          const currentBundleProduct = getBundleProduct(product.id)
          if (currentBundleProduct) {
            itemsToSave.push({
              id: currentBundleProduct.contentSelectionId,
              platform_product_variant_id: product.id,
              quantity: 0
            })
          }
        }
      }
    }

    await updateSubscriptionOrder(
      state.tokens.userToken,
      orderId,
      null,
      subscriptionContentId,
      itemsToSave
    )

    return history.push(`/account?date=${query.get('date')}`)
  }

  const getToken = async () => {
    const tokenResponse = await useUserToken()

    if (tokenResponse.token) {
      dispatch(
        setTokens({
          ...state.tokens,
          userToken: tokenResponse.token
        })
      )
      return tokenResponse.token
    }
  }

  const getCurrentMenuItems = async () => {
    setIsLoading(true)

    try {
      const newItems = []
      const newQuantities = []
      const newQuantitiesCountdown = []

      let savedItems = []
      if (!state.tokens.userToken) {
        const thisToken = getToken()
        savedItems = await getCustomerBundleItems(thisToken)
      } else {
        savedItems = await getCustomerBundleItems(state.tokens.userToken)
      }

      const bundleResponse = await getBundle(
        state.tokens.userToken,
        savedItems[0].bundleId
      )

      if (bundleResponse.data.data.length === 0) {
        throw new Error('Bundle could not be found')
      }

      const currentApiBundle = bundleResponse.data.data

      for (const configuration of currentApiBundle.configurations) {
        const response = await getProducts(configuration, savedItems[0])

        if (response) {
          const mappedProducts = response.products.map((product) => {
            const savedProduct = savedItems[0].products.find(
              (i) => i.id === product.id
            )
            let quantity = 0
            if (savedProduct) {
              quantity = savedProduct.quantity
            }
            return {
              ...product,
              quantity
            }
          })

          newItems.push({
            id: configuration.id,
            title: configuration.title,
            products: [...mappedProducts]
          })

          newQuantities.push({
            id: configuration.id,
            quantity: response.quantity
          })

          newQuantitiesCountdown.push({
            id: configuration.id,
            quantity: response.quantityCountdown
          })
        }
      }

      const productsToCart = []
      newItems.forEach((i) => {
        i.products.forEach((p) => {
          if (p.quantity > 0) {
            productsToCart.push(p)
          }
        })
      })

      dispatch(cartUpdate([...productsToCart]))

      setQuantitiesCountdown(newQuantitiesCountdown)
      setQuantities(newQuantities)
      setMenuItems(newItems)
      setIsLoading(false)
    } catch (error) {
      // TODO: do something with the error...
      console.log('error')
      console.log(error)
    }
  }

  const getProducts = async (configuration, savedItems) => {
    const nextWeekDate = query.get('date')

    const response = await getContents(
      state.tokens.userToken,
      configuration.bundleId,
      configuration.id,
      `is_enabled=1&display_after=${nextWeekDate}`
    )

    if (response.data?.data && response.data?.data.length > 0) {
      const filteredProducts = await filterShopifyProducts(
        response.data.data[0].products,
        shopProducts
      )

      const subscriptionOrder = await getSubscriptionOrder(
        state.tokens.userToken,
        orderId
      )

      // order was already placed, redirect the user
      if (subscriptionOrder.platform_order_id) {
        return history.push(`/account?dat=${query.get('date')}`)
      }

      const filteredVariants = await filterShopifyVariants(
        state,
        filteredProducts,
        subscriptionOrder.data.data[0].subscription.subscription_type,
        subscriptionOrder.data.data[0].subscription.subscription_sub_type,
        configuration
      )

      let subTotal = 0
      const quantity = response.data.data[0].configuration.quantity

      const mappedProducts = filteredVariants.map((product) => {
        const savedProduct = savedItems.products.find(
          (i) => i.id === product.id
        )

        let quantity = 0
        if (savedProduct) {
          quantity = savedProduct.quantity
        }

        return {
          ...product,
          quantity
        }
      })

      subTotal = mappedProducts
        .map((value) => value.quantity)
        .reduce((sum, number) => sum + number, 0)

      return {
        products: filteredVariants,
        quantity: quantity,
        quantityCountdown: quantity - subTotal
      }
    }
  }

  const handleAddItem = async (item, bundleContentId) => {
    const currentItem = await cartUtility.addItem(
      item,
      bundleContentId,
      quantitiesCountdown
    )
    if (!currentItem) {
      return
    }

    if (shopCustomer.id === 0) {
      return <Redirect push to="/" />
    }

    setQuantitiesCountdown(currentItem.countdown)

    const newItem = currentItem.item
    dispatch(
      cartAddItem({
        ...newItem
      })
    )
  }

  const reduceQuantities = (items) => {
    if (items.length > 0) {
      let count = 0
      for (const item of items) {
        count = count + item.quantity
      }
      return count
    }
    return 99
  }

  const handleRemoveItem = (item, bundleContentId) => {
    const currentItem = cartUtility.removeItem(
      item,
      bundleContentId,
      quantitiesCountdown
    )
    setQuantitiesCountdown(currentItem.countdown)

    const newItem = currentItem.item
    dispatch(
      cartRemoveItem({
        ...newItem
      })
    )
  }

  const getQuantityCountdown = (id) => {
    return (
      quantitiesCountdown.find((q) => q.id === id) || { id: 0, quantity: 0 }
    )
  }

  if (isLoading) {
    return <Loading />
  }

  return (
    <div className="contentWrapper">
      <div className={styles.wrapper}>
        <div className={`${styles.title} mb-7`}>Edit Order</div>
        <div className={`${styles.quantitiesWrapper} mb-8`}>
          <div className={styles.topBarQuantities}>
            {menuItems.map((product) => (
              <div key={product.id} className="px-3">
                <span className={styles.number}>
                  {getQuantityCountdown(product.id).quantity}
                </span>{' '}
                {product.title} Left
              </div>
            ))}
          </div>
        </div>

        {menuItems.map((content) => (
          <div key={content.id}>
            <div className={styles.listHeader}>
              <div className={styles.title}>{content.title}</div>
              <div className={`px-10 ${styles.quantities}`}>
                <span className={styles.number}>
                  {getQuantityCountdown(content.id).quantity}
                </span>{' '}
                {content.title} Left
              </div>
            </div>
            <div className={`${styles.cards} mb-10`}>
              {content.products.map((item) => (
                <CardQuantities
                  key={item.id}
                  title={item.name}
                  image={
                    item.feature_image
                      ? item.feature_image.src
                      : item.images.length > 0
                      ? item.images[0]
                      : process.env.EMPTY_STATE_IMAGE
                  }
                  metafields={item.metafields}
                  isChecked={cartUtility.isItemSelected(state.cart, item)}
                  quantity={cartUtility.getItemQuantity(state.cart, item)}
                  onClick={() => handleAddItem(item, content.id)}
                  onAdd={() => handleAddItem(item, content.id)}
                  onRemove={() => handleRemoveItem(item, content.id)}
                  disableAdd={getQuantityCountdown(content.id).quantity === 0}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className={styles.buttonsRow}>
        <Link to="/account" className="secondaryButton">
          Cancel
        </Link>
        <button
          disabled={disabledNextButton}
          className="primaryButton"
          onClick={handleSave}
        >
          Save
        </button>
      </div>
    </div>
  )
}

export default EditOrder
