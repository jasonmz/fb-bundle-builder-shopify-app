import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
    displayHeader,
    displayFooter,
    selectFaqType,
  } from '../../../store/slices/rootSlice'
import { Link, Redirect } from 'react-router-dom'
import styles from './Dashboard.module.scss'
import { MenuItemCard } from '../Components/MenuItemCard'
import { useUserToken } from '../../Hooks';
import {
  ChevronRightMinor,
  ChevronLeftMinor
} from '@shopify/polaris-icons';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import * as dayjs from 'dayjs';
import { request } from '../../../utils';
import { Spinner } from '../../Global';

dayjs.extend(isSameOrAfter);

const Dashboard = () => {
  const state = useSelector((state) => state)
  const dispatch = useDispatch()
  const [active, setActive] = React.useState([]);
  const [limit, setLimit] = React.useState([]);
  const [subscriptions, setSubscriptions] = React.useState([])
  const [weeksMenu, setWeeksMenu] = React.useState([])
  const [loading, setLoading] = React.useState(true);
  const token = 'Bearer <TOKEN HERE>';

  React.useEffect( () => {
    console.log('The shopify customer: ', shopCustomer)
    dispatch(displayHeader(false))
    dispatch(displayFooter(false))
    dispatch(selectFaqType(null))
    // if (!state.tokens.userToken) {
    //  getToken()
    // }
    getOrdersToShow(token);
}, []);

  const getToken = async () => {
    const tokenResponse = await useUserToken();
    if (tokenResponse.token) {
      dispatch(
        setTokens({
          ...state.tokens,
          userToken: tokenResponse.token
        })
      )
    }
  }

  const getMissingConfigurations = async (date, token, bundle, config) => {
    const subContents = await request(`${process.env.PROXY_APP_URL}/bundle-api/bundles/${bundle}/configurations/${config}/contents?display_after=${date}T00:00:00.000Z`, { method: 'get', data: '', headers: { authorization: token }}, 3)
    console.log('customer subscription items: ', subContents);
    const pendingItems = []
    
    subContents.data.data.forEach( configuration => {
      configuration.defaults.forEach( product => {
        const prod = configuration.products.filter(p => p.product_id === product.product_id)[0]
        const shopProd = shopProducts.filter( p => p.id == prod.platform_product_id)[0]
        if(!shopProd){
          console.log('no match: ', prod.platform_product_id)
        }
        
        pendingItems.push({
          title: shopProd ? shopProd.title : 'Missing Title',
          platform_img: shopProd ? shopProd.images[0]: '//cdn.shopify.com/shopifycloud/shopify/assets/no-image-2048-5e88c1b20e087fb7bbe9a3771824e743c244f437e4f8ba93bbf7b11b53f7824c_750x.gif',
          quantity: product.quantity
        })
      })  
    })

    return pendingItems
  }

  const getOrdersToShow = async (token) => {
    console.log('shopifyProducts: ', shopProducts[0]);
    // setting customer id temporarily
    // TODO make login call to get customer id from database
    const customerId = 1;
    // get next three weeks of item and j
    const activeWeeksArr = []
    const activeWeeksLimit = []
    const weeksMenu = []
    let newWeeksArr = []
    const subApi = await request(`${process.env.PROXY_APP_URL}/bundle-api/customers/${customerId}/subscriptions`, { method: 'get', data: '', headers: { authorization: token }}, 3)
    console.log('customer subscription: ', subApi);

    for (const sub of subApi.data.data) {
      const thisLoopSubList = [];
      const subscriptionId = sub.id;
      const bundleId = sub.bundle_id;
      const configurationId = sub.orders[0].bundle_configuration_content_id;

      for (const [ index, order ] of sub.orders.entries()) {
        const lastOrder = shopCustomer.orders.filter( ord => ord.id == order.platform_order_id )[0];

        const lastOrderItems = [];
        const nextSunday = dayjs().day(0).add((7 * index), 'day')
        if(lastOrder){
          lastOrder.lineItems.forEach(item => {
            lastOrderItems.push({
              title: item.title,
              platform_img: 'https://cdn.shopify.com/s/files/1/0596/3694/0985/products/bacon-ranch-chicken-high-protein-727471.jpg?v=1636153469',
              quantity: item.quantity
            })
          })

          thisLoopSubList.push({
            items: lastOrderItems,
            subId: sub.id,
            subscriptionType: sub.subscription_type,
            subscriptionSubType: sub.subscription_sub_type,
            date: nextSunday.format('YYYY-MM-DD'),
            status: 'sent',
            trackingUrl: lastOrder.fulfillments.length > 0 ? lastOrder.fulfillments[0].trackingUrl : lastOrder.orderLink,
            subscriptionDate: nextSunday.format('MMM DD')
          });
        }
        
        if(!order.platform_order_id){
          // call for bundle and look for selected menu's
          const itemList = await request(`${process.env.PROXY_APP_URL}/bundle-api/customers/${customerId}/subscriptions/${subscriptionId}/orders`, { method: 'get', data: '', headers: { authorization: token }}, 3)
          console.log('requesting the selected items: ', itemList)
          if(itemList){
            if(itemList.items){
              itemList.items.forEach(item => {
                // const itemFromStore = shopifyProducts.filter(sI => item.platform_product_variant_id === sI.variant.id)
                lastOrderItems.push({
                  title: 'default product',
                  platform_img: 'https://cdn.shopify.com/s/files/1/0596/3694/0985/products/bacon-ranch-chicken-high-protein-727471.jpg?v=1636153469',
                  quantity: item.quantity
                })
              })
            }
          } 
        }

        if(!weeksMenu.includes(nextSunday.format('MMM DD'))){ weeksMenu.push(nextSunday.format('MMM DD')); }
      }

      if(thisLoopSubList.length < 4){
        for(let j = thisLoopSubList.length; thisLoopSubList.length < 4; j++){
          const nextSunday = dayjs().day(0).add((7 * j), 'day');

          await getMissingConfigurations(nextSunday.format('YYYY-MM-DD'), token, bundleId, configurationId).then( data => {
            thisLoopSubList.push({
              items: data,
              subId: sub.id,
              subscriptionType: sub.subscription_type,
              subscriptionSubType: sub.subscription_sub_type,
              date: nextSunday.format('YYYY-MM-DD'),
              status: 'pending',
              subscriptionDate: nextSunday.format('MMM DD')
            })
          });

          if(!weeksMenu.includes(nextSunday.format('MMM DD'))){ weeksMenu.push(nextSunday.format('MMM DD')); }
        }
      }

      newWeeksArr = newWeeksArr.concat(thisLoopSubList)
    }

    newWeeksArr.forEach((sub) => {
      const today = dayjs(new Date()).day(0).add(14, 'day').startOf('day');
      const thisYear = dayjs().year();
      const pastDate = dayjs(new Date(`${sub.subscriptionDate} ${thisYear}`)).startOf('day');

      if(!pastDate.isSameOrAfter(today)){
        activeWeeksArr.push(sub);
        activeWeeksLimit.push(5)
      }
    })

    setSubscriptions(newWeeksArr);
    setWeeksMenu(weeksMenu)
    setActive(activeWeeksArr)
    setLimit(activeWeeksLimit)
    setLoading(false)
  }

  const handleChange = (week) => {
    console.log(subscriptions);
    const newActive = subscriptions.filter( a => a.subscriptionDate === week)
    console.log(newActive);
    if(newActive.length > 0){
      setActive(newActive)
      const newLimitArr = [];
      for(let i = 0; i < newActive.length; i ++){
        newLimitArr.push(5)
      }
      setLimit(newLimitArr)
    }
    
  }

  const resetLimit = (spot) => {
    const newLimit = [];
    limit.forEach((i, index) => {
      if(index === spot ){
        newLimit.push(40)
      } else {
        newLimit.push(5)
      }
    });
    setLimit(newLimit);
  }

  const closeLimit = (spot) => {
    const newLimit = [];
    limit.forEach((i, index) => {
      if(index === spot ){
        newLimit.push(5)
      } else {
        newLimit.push(5)
      }
    });
    setLimit(newLimit);
  }

  if(!shopCustomer || shopCustomer.id === 0){
    return <Redirect push to="/" />
  }

  if (loading) {
    // TODO: work in progress
    return (
      <Spinner label="Loading..." />
    )
  }


  return (
    <div className={styles.accountWrapper}>
      <div className={styles.header}>
        <div className={styles.nameHeader}>
            <h1 className={styles.userName}>
                Hi {shopCustomer.firstName}!
            </h1>
        </div>
        <div className={styles.weekMenu}>
            <p className={styles.weekMenuLabel}>Select Week</p>
            <div className={`buttons ${styles.weekMenuItems}`}>
              {weeksMenu.map((date, index) => {
                return ( <button key={index} onClick={() => handleChange(date)} className={ active.filter( a => a.subscriptionDate === date).length > 0 ? "primaryButton largeButton" : "secondaryButton largeButton"}>{date}</button> )
              })}
            </div>
        </div>
      </div>
      <div className={styles.promoSection}>
        <p>Promo Section</p>
      </div>
      <div className="contentWrapper">
        {active.map((sub, idx) => (
          <div key={idx} className={styles.subscriptionRow}>
            <div className={styles.menuRow}>
              <div className={styles.headerWthLink}>
                <h3>Week of {sub.subscriptionDate}</h3>
                {sub.status === 'sent' ? <Link to={sub.trackingUrl} className={styles.primaryLink}>Track Package</Link> : ''}
              </div>
              {sub.status === 'sent' ? <Link to="/order-history" className="secondaryButton">Order Summary</Link>  : <Link to={`/edit-order/${sub.subId}?date=${sub.date}`} className="secondaryButton">Edit Order</Link>}
            </div>
            {sub.items.length > 0 ? (
            <div className={styles.accountMenuRow}>
              {sub.items.map((item, index) => (
                index < limit[idx] ? <MenuItemCard key={index} title={item.title} image={item.platform_img} quantity={item.quantity} type={sub.subscriptionSubType} /> : ''
              ))}

              {limit[idx] === 5 ? (
                <Link to="#" onClick={() => resetLimit(idx)} className={styles.viewAllLink}>
                  See All <ChevronRightMinor />
                </Link>
              ) : (
                <Link to="#" onClick={() => closeLimit(idx)} className={styles.viewAllLink}>
                  <ChevronLeftMinor /> Close
                </Link>
              )}
            </div>
            ) : (
              <div className={styles.emptyStateMessage}>
                <h2>No items to choose</h2>
                <p>Please come back soon to choose your menu items.</p>
              </div>
            )}
        </div>
        ))}
      </div>
    </div>
  )
}

export default Dashboard
