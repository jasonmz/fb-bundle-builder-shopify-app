const mapBundleTypeSubtype = (bundle) => {
  if (!bundle.variants) {
    throw new Error('Cannot find any variants to map')
  }

  const createType = (id, name, image, options) => {
    return {
      id,
      name: name.toLowerCase(),
      featuredImage: image,
      options
    }
  }

  const createSubtype = (id, name, metafields) => {
    return {
      id,
      name,
      metafields
    }
  }

  const formattedValues = []

  let currentVariantId = 0
  let currentOptionId = 0
  bundle.variants.forEach((variant) => {
    variant.options.forEach((option) => {
      const parentValue = formattedValues.find(
        (parent) => parent.name === variant.option1.toLowerCase()
      )

      if (!parentValue) {
        currentVariantId++
        formattedValues.push(
          createType(
            currentVariantId,
            option.toLowerCase(),
            variant.featured_image?.src,
            []
          )
        )
      } else {
        if (option.toLowerCase() !== variant.option1.toLowerCase()) {
          currentOptionId++

          parentValue.options.push(
            createSubtype(currentOptionId, option.toLowerCase(), [
              ...variant.metafields,
              ...bundle.metafields
            ])
          )
        }
      }
    })
  })

  return formattedValues
}

const getBundleMetafield = (metafields, key) =>
  metafields.find((m) => m.key === key)

const createVariantObject = (variant, product, configuration) => {
  variant.images = product.images
  variant.configurationBundleId = configuration.bundleId
  variant.configurationContentId = product.bundle_configuration_content_id
  variant.description = product.description
  variant.bundleContentId = configuration.id
  variant.quantity = 0
  variant.type = configuration.title
  variant.productPlatformId = product.id
  if (variant.name.includes('-')) {
    variant.name = variant.name.split('-')[0]
  }
  return variant
}

const mapBundleItems = (
  shopifyProducts,
  bundles,
  subscription,
  configuration
) => {
  const bundle = bundles.find((b) => b.id === subscription.platform_product_id)
  const variant = bundle.variants.find(
    (v) => v.id === subscription.platform_variant_id
  )

  return shopifyProducts.map((product) => {
    const subtype = product.variants.find(
      (v) => v.option1 === variant.option1 && v.option2 === variant.option2
    )
    return createVariantObject(subtype, product, configuration)
  })
}

const mapBundleItemsByOption = (
  shopifyProducts,
  type,
  subType,
  configuration
) => {
  const filteredVariants = []
  const formattedString = (value) => {
    return value.toLowerCase().split(' ').join('')
  }

  for (const product of shopifyProducts) {
    const variants = product.variants.filter((variant) => {
      const formattedOptions = variant.options.map((option) =>
        formattedString(option)
      )

      return (
        formattedOptions.includes(formattedString(type)) &&
        formattedOptions.includes(formattedString(subType))
      )
    })

    variants.map((variant) => {
      return createVariantObject(variant, product, configuration)
    })

    if (variants.length > 0) {
      filteredVariants.push(...variants)
    }
  }

  return filteredVariants
}

export {
  mapBundleTypeSubtype,
  getBundleMetafield,
  mapBundleItems,
  mapBundleItemsByOption
}
