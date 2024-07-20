import { connectToDB } from '@/lib/mongoose'
import Product from '@/lib/models/product.model'
import { scrapeAmazonProduct } from '@/lib/actions/scraper'
import {
  getAveragePrice,
  getHighestPrice,
  getLowestPrice
} from '@/lib/actions/utils'
import { getEmailNotifType } from '@/lib/actions/utils'
import { generateEmailBody, sendEmail } from '@/lib/nodemailer'
import { NextResponse } from 'next/server'
export const maxDuration = 50
export const dynamic = 'force-dynamic'
export const revalidate = 0
export async function GET () {
  try {
    connectToDB()
    const products = await Product.find({})
    if (!products) {
      throw new Error('No products found')
    }
    // Scrape latest product details and update db
    // update all the products at the same time (prices will change ofc)
    const updatedProducts = await Promise.all(
      products.map(async currentProduct => {
        const scrapedProduct = await scrapeAmazonProduct(currentProduct.url)

        if (!scrapedProduct) {
          throw new Error('No product found')
        }
        const updatedPriceHistory = [
          ...currentProduct.priceHistory,
          { price: scrapedProduct.currentPrice }
        ]

        const product = {
          ...scrapedProduct,
          priceHistory: updatedPriceHistory,
          lowestPrice: getLowestPrice(updatedPriceHistory),
          highestPrice: getHighestPrice(updatedPriceHistory),
          averagePrice: getAveragePrice(updatedPriceHistory)
        }

        const updatedProduct = await Product.findOneAndUpdate(
          { url: product.url },
          product
        )
        // check each products status and send mail accordingly

        const emailNotifType = getEmailNotifType(scrapedProduct, currentProduct)

        if (emailNotifType && updatedProduct.users.length > 0) {
          const productInfo = {
            title: updatedProduct.title,
            url: updatedProduct.url
          }

          const emailContent = await generateEmailBody(
            productInfo,
            emailNotifType
          )

          // array consisting of all user emails to send
          const userEmails = updatedProduct.users.map((user: any) => user.email)

          await sendEmail(emailContent, userEmails)

          return updatedProduct
        }
      })
    )

    return NextResponse.json({
      message: 'Ok',
      data: updatedProducts
    })
  } catch (error) {
    throw new Error(`Error in GET : ${error}`)
  }
}
